import logging
import os
from datetime import date
from typing import Annotated, Any, Literal, Union
from uuid import uuid4

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import BoardData, ChecklistText, Labels, Priority

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "nvidia/nemotron-3.5-super-vl:free"
OPENROUTER_TIMEOUT = 30.0


class ConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class CreateCardMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["create_card"]
    column_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    details: str
    priority: Priority | None = None
    due_date: date | None = None
    labels: Labels = []
    checklist: list[ChecklistText] = Field(default=[], max_length=50)


# Edit mutation fields mapped to card fields. Omitted fields are unchanged;
# priority and due_date may be set to null to clear them.
EDITABLE_CARD_FIELDS = {
    "title": "title",
    "details": "details",
    "priority": "priority",
    "due_date": "dueDate",
    "labels": "labels",
    "archived": "archived",
}


class EditCardMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["edit_card"]
    card_id: str = Field(min_length=1)
    title: str | None = Field(default=None, min_length=1)
    details: str | None = None
    priority: Priority | None = None
    due_date: date | None = None
    labels: Labels | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def require_card_changes(self) -> "EditCardMutation":
        changed = self.model_fields_set & EDITABLE_CARD_FIELDS.keys()
        if not changed:
            raise ValueError("Edit mutation must change at least one card field.")
        for field in ("title", "details", "labels", "archived"):
            if field in changed and getattr(self, field) is None:
                raise ValueError(f"Edit mutation cannot clear {field}.")
        return self


class MoveCardMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["move_card"]
    card_id: str = Field(min_length=1)
    column_id: str = Field(min_length=1)


class RenameColumnMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["rename_column"]
    column_id: str = Field(min_length=1)
    title: str = Field(min_length=1)


class CheckItemMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["check_item"]
    card_id: str = Field(min_length=1)
    item_id: str = Field(min_length=1)
    done: bool


class SetWipLimitMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["set_wip_limit"]
    column_id: str = Field(min_length=1)
    wip_limit: int | None = Field(ge=1, le=99)


BoardMutation = Annotated[
    Union[
        CreateCardMutation,
        EditCardMutation,
        MoveCardMutation,
        CheckItemMutation,
        RenameColumnMutation,
        SetWipLimitMutation,
    ],
    Field(discriminator="action"),
]


class AIAssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=4000)
    history: list[ConversationMessage] = Field(default_factory=list, max_length=20)


class AIAssistantResponse(BaseModel):
    reply: str
    board: BoardData | None = None
    model: str


class AIAssistantOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reply: str = Field(min_length=1)
    mutations: list[BoardMutation] = Field(max_length=20)


async def openrouter_completion(
    messages: list[dict[str, str]],
    *,
    json_mode: bool = False,
) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is not configured.",
        )

    request_body: dict[str, Any] = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
    }
    if json_mode:
        request_body["response_format"] = {"type": "json_object"}

    try:
        async with httpx.AsyncClient(timeout=OPENROUTER_TIMEOUT) as client:
            response = await client.post(
                OPENROUTER_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=request_body,
            )
    except httpx.TimeoutException as error:
        logger.warning("OpenRouter request timed out.")
        raise HTTPException(
            status_code=504, detail="OpenRouter request timed out."
        ) from error
    except httpx.RequestError as error:
        logger.error("OpenRouter request failed (%s).", type(error).__name__)
        raise HTTPException(
            status_code=502, detail="Unable to reach OpenRouter."
        ) from error

    if response.is_error:
        logger.warning("OpenRouter returned HTTP %s.", response.status_code)
        if response.status_code in (401, 403):
            detail = "OpenRouter rejected the API key."
        else:
            detail = f"OpenRouter request failed with status {response.status_code}."
        raise HTTPException(status_code=502, detail=detail)

    try:
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as error:
        logger.error("OpenRouter response did not contain a valid completion.")
        raise HTTPException(
            status_code=502, detail="OpenRouter returned an invalid response."
        ) from error

    if not isinstance(content, str):
        logger.error("OpenRouter completion content was not text.")
        raise HTTPException(
            status_code=502, detail="OpenRouter returned an invalid response."
        )
    return content


def apply_board_mutations(
    board: BoardData,
    mutations: list[BoardMutation],
) -> BoardData:
    board_data = board.model_dump()
    for mutation in mutations:
        if isinstance(mutation, CreateCardMutation):
            column = next(
                (
                    column
                    for column in board_data["columns"]
                    if column["id"] == mutation.column_id
                ),
                None,
            )
            if column is None:
                raise ValueError("Create mutation references an unknown column.")
            card_id = f"card-{uuid4().hex}"
            board_data["cards"][card_id] = {
                "id": card_id,
                "title": mutation.title,
                "details": mutation.details,
                "priority": mutation.priority,
                "dueDate": mutation.due_date,
                "labels": mutation.labels,
                "checklist": [
                    {"id": f"item-{uuid4().hex}", "text": text, "done": False}
                    for text in mutation.checklist
                ],
            }
            column["cardIds"].append(card_id)
        elif isinstance(mutation, EditCardMutation):
            card = board_data["cards"].get(mutation.card_id)
            if card is None:
                raise ValueError("Edit mutation references an unknown card.")
            for field in mutation.model_fields_set & EDITABLE_CARD_FIELDS.keys():
                card[EDITABLE_CARD_FIELDS[field]] = getattr(mutation, field)
        elif isinstance(mutation, CheckItemMutation):
            card = board_data["cards"].get(mutation.card_id)
            items = card["checklist"] if card else []
            item = next((item for item in items if item["id"] == mutation.item_id), None)
            if item is None:
                raise ValueError("Check mutation references an unknown checklist item.")
            item["done"] = mutation.done
        elif isinstance(mutation, MoveCardMutation):
            card = board_data["cards"].get(mutation.card_id)
            target_column = next(
                (
                    column
                    for column in board_data["columns"]
                    if column["id"] == mutation.column_id
                ),
                None,
            )
            if card is None or target_column is None:
                raise ValueError("Move mutation references an unknown card or column.")
            for column in board_data["columns"]:
                if mutation.card_id in column["cardIds"]:
                    column["cardIds"].remove(mutation.card_id)
                    break
            target_column["cardIds"].append(mutation.card_id)
        else:
            column = next(
                (
                    column
                    for column in board_data["columns"]
                    if column["id"] == mutation.column_id
                ),
                None,
            )
            if column is None:
                raise ValueError("Column mutation references an unknown column.")
            if isinstance(mutation, RenameColumnMutation):
                column["title"] = mutation.title
            else:
                column["wipLimit"] = mutation.wip_limit

    return BoardData.model_validate(board_data)


def build_messages(
    board: BoardData, message: str, history: list[ConversationMessage]
) -> list[dict[str, str]]:
    instructions = (
        "You are a project board assistant. Answer the user's request using the "
        "provided board and conversation. Return only a JSON object with exactly "
        'these fields: {"reply": string, "mutations": array}. Use an empty '
        "mutations array when no board change is requested. Mutations must be "
        "explicit and use only these shapes: "
        '{"action":"create_card","column_id":"...","title":"...","details":"...",'
        '"priority":"high","due_date":"YYYY-MM-DD","labels":["..."],'
        '"checklist":["..."]} (priority, due_date, labels, and checklist item '
        "texts are optional); "
        '{"action":"edit_card","card_id":"...","title":"..."} (supply any of '
        "title, details, priority, due_date, labels, archived; set priority or "
        "due_date to null to clear it; archived true hides the card from the "
        "board and false restores it); "
        '{"action":"move_card","card_id":"...","column_id":"..."}; '
        '{"action":"check_item","card_id":"...","item_id":"...","done":true} '
        "(marks a checklist item done or not done); "
        '{"action":"rename_column","column_id":"...","title":"..."}; '
        '{"action":"set_wip_limit","column_id":"...","wip_limit":3} (1-99, or '
        "null to remove the limit). "
        "Only use IDs present in the board for existing cards and columns. "
        "For a new card, do not invent an ID. Priority is one of low, medium, "
        "or high. Labels are short tags, at most 10 per card. A column's wipLimit "
        "is an advisory maximum count of its unarchived cards; mention it when a "
        "change exceeds it. Archived cards are hidden from the board; only "
        "mention them when the user asks about archived work. "
        f"Today's date is {date.today().isoformat()}."
    )
    messages = [{"role": "system", "content": instructions}]
    messages.extend(item.model_dump() for item in history)
    messages.append(
        {
            "role": "user",
            "content": (
                f"Current board JSON:\n{board.model_dump_json()}\n\n"
                f"User request:\n{message}"
            ),
        }
    )
    return messages


async def run_assistant(
    board: BoardData, request: AIAssistantRequest
) -> tuple[str, BoardData | None]:
    """Return the assistant reply and the updated board, or None if unchanged."""
    content = await openrouter_completion(
        build_messages(board, request.message, request.history), json_mode=True
    )
    try:
        assistant_output = AIAssistantOutput.model_validate_json(content)
    except ValueError as error:
        logger.error("OpenRouter returned invalid structured assistant output.")
        raise HTTPException(
            status_code=502,
            detail="OpenRouter returned an invalid assistant response.",
        ) from error

    try:
        updated_board = apply_board_mutations(board, assistant_output.mutations)
    except ValueError as error:
        logger.error("OpenRouter returned a mutation invalid for the submitted board.")
        raise HTTPException(
            status_code=502,
            detail="OpenRouter returned an invalid board mutation.",
        ) from error

    return assistant_output.reply, updated_board if assistant_output.mutations else None

from pathlib import Path
import logging
import os
from typing import Annotated, Any, Literal, Union
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import database

app = FastAPI(title="PM MVP Backend")
logger = logging.getLogger(__name__)

project_root = Path(__file__).resolve().parents[2]
frontend_dist = project_root / "frontend" / "out"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "minimax/minimax-m3.1-flash:free"
OPENROUTER_TIMEOUT = 30.0


class BoardCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    details: str


class BoardColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    cardIds: list[str]


class BoardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[BoardColumn] = Field(min_length=1)
    cards: dict[str, BoardCard]

    @model_validator(mode="after")
    def validate_card_membership(self) -> "BoardData":
        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("Column IDs must be unique.")

        listed_card_ids = [
            card_id for column in self.columns for card_id in column.cardIds
        ]
        if len(listed_card_ids) != len(set(listed_card_ids)):
            raise ValueError("Each card must appear in exactly one column.")
        if set(listed_card_ids) != set(self.cards):
            raise ValueError("Columns must reference every card exactly once.")
        if any(card_id != card.id for card_id, card in self.cards.items()):
            raise ValueError("Card IDs must match their map keys.")
        return self


class AICompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)


class AICompletionResponse(BaseModel):
    answer: str
    model: str


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


class EditCardMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["edit_card"]
    card_id: str = Field(min_length=1)
    title: str | None = Field(default=None, min_length=1)
    details: str | None = None

    @model_validator(mode="after")
    def require_card_changes(self) -> "EditCardMutation":
        if self.title is None and self.details is None:
            raise ValueError("Edit mutation must change title or details.")
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


BoardMutation = Annotated[
    Union[
        CreateCardMutation,
        EditCardMutation,
        MoveCardMutation,
        RenameColumnMutation,
    ],
    Field(discriminator="action"),
]


class AIAssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    board: BoardData
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
            }
            column["cardIds"].append(card_id)
        elif isinstance(mutation, EditCardMutation):
            card = board_data["cards"].get(mutation.card_id)
            if card is None:
                raise ValueError("Edit mutation references an unknown card.")
            if mutation.title is not None:
                card["title"] = mutation.title
            if mutation.details is not None:
                card["details"] = mutation.details
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
                raise ValueError("Rename mutation references an unknown column.")
            column["title"] = mutation.title

    return BoardData.model_validate(board_data)


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "hello from PM MVP", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/board", response_model=BoardData)
def read_board() -> dict[str, Any]:
    return database.get_board()


@app.put("/api/board", response_model=BoardData)
def update_board(board: BoardData) -> dict[str, Any]:
    board_data = board.model_dump()
    database.save_board(board_data)
    return board_data


@app.post("/api/ai/completion", response_model=AICompletionResponse)
async def complete_ai_prompt(request: AICompletionRequest) -> AICompletionResponse:
    answer = await openrouter_completion(
        [{"role": "user", "content": request.prompt}]
    )
    return AICompletionResponse(answer=answer, model=OPENROUTER_MODEL)


@app.post("/api/ai/assistant", response_model=AIAssistantResponse)
async def assist_with_board(
    request: AIAssistantRequest,
) -> AIAssistantResponse:
    instructions = (
        "You are a project board assistant. Answer the user's request using the "
        "provided board and conversation. Return only a JSON object with exactly "
        'these fields: {"reply": string, "mutations": array}. Use an empty '
        "mutations array when no board change is requested. Mutations must be "
        "explicit and use only these shapes: "
        '{"action":"create_card","column_id":"...","title":"...","details":"..."}; '
        '{"action":"edit_card","card_id":"...","title":"..."} (title and/or '
        "details may be supplied); "
        '{"action":"move_card","card_id":"...","column_id":"..."}; '
        '{"action":"rename_column","column_id":"...","title":"..."}. '
        "Only use IDs present in the board for existing cards and columns. "
        "For a new card, do not invent an ID."
    )
    messages = [{"role": "system", "content": instructions}]
    messages.extend(message.model_dump() for message in request.history)
    messages.append(
        {
            "role": "user",
            "content": (
                f"Current board JSON:\n{request.board.model_dump_json()}\n\n"
                f"User request:\n{request.message}"
            ),
        }
    )

    content = await openrouter_completion(messages, json_mode=True)
    try:
        assistant_output = AIAssistantOutput.model_validate_json(content)
    except ValueError as error:
        logger.error("OpenRouter returned invalid structured assistant output.")
        raise HTTPException(
            status_code=502,
            detail="OpenRouter returned an invalid assistant response.",
        ) from error

    try:
        updated_board = apply_board_mutations(request.board, assistant_output.mutations)
    except ValueError as error:
        logger.error("OpenRouter returned a mutation invalid for the submitted board.")
        raise HTTPException(
            status_code=502,
            detail="OpenRouter returned an invalid board mutation.",
        ) from error

    if assistant_output.mutations:
        database.save_board(updated_board.model_dump())

    return AIAssistantResponse(
        reply=assistant_output.reply,
        board=updated_board if assistant_output.mutations else None,
        model=OPENROUTER_MODEL,
    )


if frontend_dist.exists():

    @app.get("/")
    def root() -> FileResponse:
        return FileResponse(frontend_dist / "index.html")

    app.mount("/", StaticFiles(directory=frontend_dist), name="frontend")

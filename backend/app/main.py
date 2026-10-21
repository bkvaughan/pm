from pathlib import Path
import logging
import os
from typing import Any

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
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is not configured.",
        )

    try:
        async with httpx.AsyncClient(timeout=OPENROUTER_TIMEOUT) as client:
            response = await client.post(
                OPENROUTER_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": OPENROUTER_MODEL,
                    "messages": [{"role": "user", "content": request.prompt}],
                },
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
    except ValueError as error:
        logger.error("OpenRouter returned invalid JSON.")
        raise HTTPException(
            status_code=502, detail="OpenRouter returned an invalid response."
        ) from error

    try:
        answer = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        logger.error("OpenRouter response did not contain a completion.")
        raise HTTPException(
            status_code=502, detail="OpenRouter returned an invalid response."
        ) from error

    if not isinstance(answer, str):
        logger.error("OpenRouter completion content was not text.")
        raise HTTPException(
            status_code=502, detail="OpenRouter returned an invalid response."
        )

    return AICompletionResponse(answer=answer, model=OPENROUTER_MODEL)


if frontend_dist.exists():

    @app.get("/")
    def root() -> FileResponse:
        return FileResponse(frontend_dist / "index.html")

    app.mount("/", StaticFiles(directory=frontend_dist), name="frontend")

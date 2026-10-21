from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field, model_validator
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import database

app = FastAPI(title="PM MVP Backend")

project_root = Path(__file__).resolve().parents[2]
frontend_dist = project_root / "frontend" / "out"


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


if frontend_dist.exists():

    @app.get("/")
    def root() -> FileResponse:
        return FileResponse(frontend_dist / "index.html")

    app.mount("/", StaticFiles(directory=frontend_dist), name="frontend")

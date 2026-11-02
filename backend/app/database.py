import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any, Optional

from app.initial_data import INITIAL_BOARD

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("PM_DATABASE_PATH", PROJECT_ROOT / "data" / "pm.sqlite3"))
DEMO_USER_ID = "user"
DEMO_BOARD_ID = "board-user"


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    db_path = db_path or DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(db_path: Optional[Path] = None) -> None:
    db_path = db_path or DB_PATH
    with closing(connect(db_path)) as connection, connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS board_columns (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                position INTEGER NOT NULL,
                UNIQUE (board_id, id),
                UNIQUE (board_id, position)
            );
            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                column_id TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (board_id, column_id)
                    REFERENCES board_columns(board_id, id) ON DELETE CASCADE,
                UNIQUE (column_id, position)
            );
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)",
            (DEMO_USER_ID, DEMO_USER_ID),
        )
        connection.execute(
            "INSERT OR IGNORE INTO boards (id, user_id) VALUES (?, ?)",
            (DEMO_BOARD_ID, DEMO_USER_ID),
        )
        has_columns = connection.execute(
            "SELECT 1 FROM board_columns WHERE board_id = ? LIMIT 1",
            (DEMO_BOARD_ID,),
        ).fetchone()
        if not has_columns:
            _insert_board(connection, DEMO_BOARD_ID, INITIAL_BOARD)


def _insert_board(
    connection: sqlite3.Connection, board_id: str, board: dict[str, Any]
) -> None:
    for column_position, column in enumerate(board["columns"]):
        connection.execute(
            """
            INSERT INTO board_columns (id, board_id, title, position)
            VALUES (?, ?, ?, ?)
            """,
            (column["id"], board_id, column["title"], column_position),
        )
        for card_position, card_id in enumerate(column["cardIds"]):
            card = board["cards"][card_id]
            connection.execute(
                """
                INSERT INTO cards (id, board_id, column_id, title, details, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    card["id"],
                    board_id,
                    column["id"],
                    card["title"],
                    card["details"],
                    card_position,
                ),
            )


def get_board(db_path: Optional[Path] = None) -> dict[str, Any]:
    db_path = db_path or DB_PATH
    with closing(connect(db_path)) as connection:
        columns = connection.execute(
            """
            SELECT id, title FROM board_columns
            WHERE board_id = ? ORDER BY position
            """,
            (DEMO_BOARD_ID,),
        ).fetchall()
        cards = connection.execute(
            """
            SELECT id, column_id, title, details FROM cards
            WHERE board_id = ? ORDER BY column_id, position
            """,
            (DEMO_BOARD_ID,),
        ).fetchall()

    cards_by_column: dict[str, list[sqlite3.Row]] = {
        column["id"]: [] for column in columns
    }
    for card in cards:
        cards_by_column[card["column_id"]].append(card)

    return {
        "columns": [
            {
                "id": column["id"],
                "title": column["title"],
                "cardIds": [card["id"] for card in cards_by_column[column["id"]]],
            }
            for column in columns
        ],
        "cards": {
            card["id"]: {
                "id": card["id"],
                "title": card["title"],
                "details": card["details"],
            }
            for card in cards
        },
    }


def save_board(board: dict[str, Any], db_path: Optional[Path] = None) -> None:
    db_path = db_path or DB_PATH
    with closing(connect(db_path)) as connection, connection:
        connection.execute("DELETE FROM cards WHERE board_id = ?", (DEMO_BOARD_ID,))
        connection.execute(
            "DELETE FROM board_columns WHERE board_id = ?", (DEMO_BOARD_ID,)
        )
        _insert_board(connection, DEMO_BOARD_ID, board)

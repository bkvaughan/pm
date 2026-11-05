import hashlib
import json
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from app.activity import describe_changes
from app.initial_data import INITIAL_BOARD
from app.security import hash_password

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("PM_DATABASE_PATH", PROJECT_ROOT / "data" / "pm.sqlite3"))
SCHEMA_VERSION = 4
ACTIVITY_RETENTION = 200
SESSION_LIFETIME = timedelta(days=30)
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
LEGACY_BOARD_ID = "board-user"
DEFAULT_COLUMN_TITLES = ["To Do", "In Progress", "Review", "Done"]

SCHEMA = """
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX boards_user_id ON boards(user_id);
CREATE TABLE board_columns (
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    wip_limit INTEGER,
    position INTEGER NOT NULL,
    PRIMARY KEY (board_id, id),
    UNIQUE (board_id, position)
);
CREATE TABLE cards (
    board_id TEXT NOT NULL,
    id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    priority TEXT,
    due_date TEXT,
    labels TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL,
    PRIMARY KEY (board_id, id),
    FOREIGN KEY (board_id, column_id)
        REFERENCES board_columns(board_id, id) ON DELETE CASCADE,
    UNIQUE (board_id, column_id, position)
);
CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX activity_board_id ON activity(board_id, id);
"""

# Upgrades applied to an existing database, keyed by the version they produce.
MIGRATIONS = {
    2: """
    ALTER TABLE cards ADD COLUMN priority TEXT;
    ALTER TABLE cards ADD COLUMN due_date TEXT;
    ALTER TABLE cards ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';
    """,
    3: "ALTER TABLE board_columns ADD COLUMN wip_limit INTEGER;",
    4: """
    CREATE TABLE activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX activity_board_id ON activity(board_id, id);
    """,
}


class UsernameTakenError(Exception):
    pass


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    db_path = db_path or DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    """Create or upgrade the schema; version 0 is a new or single-board MVP database."""
    with closing(connect()) as connection, connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version == SCHEMA_VERSION:
            return
        if version > 0:
            for target in range(version + 1, SCHEMA_VERSION + 1):
                connection.executescript(MIGRATIONS[target])
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            return

        has_legacy_tables = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'"
        ).fetchone()
        demo_board = INITIAL_BOARD
        if has_legacy_tables:
            legacy_board = _read_legacy_board(connection)
            if legacy_board["columns"]:
                demo_board = legacy_board
            connection.executescript(
                """
                DROP TABLE IF EXISTS cards;
                DROP TABLE IF EXISTS board_columns;
                DROP TABLE IF EXISTS boards;
                DROP TABLE IF EXISTS users;
                """
            )

        connection.executescript(SCHEMA)
        user = _insert_user(
            connection, DEMO_USERNAME, "Demo User", hash_password(DEMO_PASSWORD)
        )
        _insert_new_board(connection, user["id"], "Product Roadmap", demo_board)
        connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


# Users


def _user_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
    }


def _insert_user(
    connection: sqlite3.Connection,
    username: str,
    display_name: str,
    password_hash: str,
) -> dict[str, Any]:
    user_id = _new_id("user")
    try:
        connection.execute(
            """
            INSERT INTO users (id, username, display_name, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, username, display_name, password_hash, _now()),
        )
    except sqlite3.IntegrityError as error:
        raise UsernameTakenError(username) from error
    return {"id": user_id, "username": username, "displayName": display_name}


def create_user(username: str, display_name: str, password_hash: str) -> dict[str, Any]:
    """Create a user with a starter board."""
    with closing(connect()) as connection, connection:
        user = _insert_user(connection, username, display_name, password_hash)
        _insert_new_board(connection, user["id"], "My First Board")
    return user


def get_credentials(username: str) -> Optional[tuple[dict[str, Any], str]]:
    with closing(connect()) as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    return (_user_dict(row), row["password_hash"]) if row else None


def get_password_hash(user_id: str) -> str:
    with closing(connect()) as connection:
        return connection.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user_id,)
        ).fetchone()[0]


def update_display_name(user_id: str, display_name: str) -> dict[str, Any]:
    with closing(connect()) as connection, connection:
        connection.execute(
            "UPDATE users SET display_name = ? WHERE id = ?", (display_name, user_id)
        )
        row = connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return _user_dict(row)


def update_password(user_id: str, password_hash: str, keep_token: str) -> None:
    """Change the password and sign out every other session."""
    with closing(connect()) as connection, connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id)
        )
        connection.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user_id, _hash_token(keep_token)),
        )


def delete_user(user_id: str) -> None:
    with closing(connect()) as connection, connection:
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))


# Sessions


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(UTC) + SESSION_LIFETIME).isoformat()
    with closing(connect()) as connection, connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (_now(),))
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (_hash_token(token), user_id, expires_at),
        )
    return token


def get_session_user(token: str) -> Optional[dict[str, Any]]:
    with closing(connect()) as connection:
        row = connection.execute(
            """
            SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (_hash_token(token), _now()),
        ).fetchone()
    return _user_dict(row) if row else None


def delete_session(token: str) -> None:
    with closing(connect()) as connection, connection:
        connection.execute(
            "DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),)
        )


# Boards


def _default_board() -> dict[str, Any]:
    return {
        "columns": [
            {"id": _new_id("col"), "title": title, "cardIds": [], "wipLimit": None}
            for title in DEFAULT_COLUMN_TITLES
        ],
        "cards": {},
    }


def _insert_new_board(
    connection: sqlite3.Connection,
    user_id: str,
    name: str,
    board: Optional[dict[str, Any]] = None,
) -> str:
    board_id = _new_id("board")
    now = _now()
    connection.execute(
        """
        INSERT INTO boards (id, user_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (board_id, user_id, name, now, now),
    )
    _insert_board_contents(connection, board_id, board or _default_board())
    _record_activity(connection, board_id, "user", [f'Created board "{name}"'])
    return board_id


def _insert_board_contents(
    connection: sqlite3.Connection, board_id: str, board: dict[str, Any]
) -> None:
    for column_position, column in enumerate(board["columns"]):
        connection.execute(
            """
            INSERT INTO board_columns (board_id, id, title, wip_limit, position)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                board_id,
                column["id"],
                column["title"],
                column["wipLimit"],
                column_position,
            ),
        )
        for card_position, card_id in enumerate(column["cardIds"]):
            card = board["cards"][card_id]
            connection.execute(
                """
                INSERT INTO cards (
                    board_id, id, column_id, title, details,
                    priority, due_date, labels, position
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    board_id,
                    card["id"],
                    column["id"],
                    card["title"],
                    card["details"],
                    card["priority"],
                    card["dueDate"],
                    json.dumps(card["labels"]),
                    card_position,
                ),
            )


def _read_legacy_board(connection: sqlite3.Connection) -> dict[str, Any]:
    columns = connection.execute(
        """
        SELECT id, title, NULL AS wip_limit FROM board_columns
        WHERE board_id = ? ORDER BY position
        """,
        (LEGACY_BOARD_ID,),
    ).fetchall()
    cards = connection.execute(
        """
        SELECT id, column_id, title, details, NULL AS priority, NULL AS due_date,
            '[]' AS labels
        FROM cards WHERE board_id = ? ORDER BY column_id, position
        """,
        (LEGACY_BOARD_ID,),
    ).fetchall()
    return _board_dict(columns, cards)


def _read_board(connection: sqlite3.Connection, board_id: str) -> dict[str, Any]:
    columns = connection.execute(
        """
        SELECT id, title, wip_limit FROM board_columns
        WHERE board_id = ? ORDER BY position
        """,
        (board_id,),
    ).fetchall()
    cards = connection.execute(
        """
        SELECT id, column_id, title, details, priority, due_date, labels FROM cards
        WHERE board_id = ? ORDER BY column_id, position
        """,
        (board_id,),
    ).fetchall()
    return _board_dict(columns, cards)


def _board_dict(
    columns: list[sqlite3.Row], cards: list[sqlite3.Row]
) -> dict[str, Any]:
    card_ids_by_column: dict[str, list[str]] = {column["id"]: [] for column in columns}
    for card in cards:
        card_ids_by_column[card["column_id"]].append(card["id"])

    return {
        "columns": [
            {
                "id": column["id"],
                "title": column["title"],
                "cardIds": card_ids_by_column[column["id"]],
                "wipLimit": column["wip_limit"],
            }
            for column in columns
        ],
        "cards": {
            card["id"]: {
                "id": card["id"],
                "title": card["title"],
                "details": card["details"],
                "priority": card["priority"],
                "dueDate": card["due_date"],
                "labels": json.loads(card["labels"]),
            }
            for card in cards
        },
    }


BOARD_SUMMARY_QUERY = """
SELECT boards.id, boards.name, boards.created_at, boards.updated_at,
    (SELECT COUNT(*) FROM cards WHERE cards.board_id = boards.id) AS card_count
FROM boards
"""


def _summary_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "cardCount": row["card_count"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_boards(user_id: str) -> list[dict[str, Any]]:
    with closing(connect()) as connection:
        rows = connection.execute(
            BOARD_SUMMARY_QUERY + "WHERE boards.user_id = ? ORDER BY boards.created_at",
            (user_id,),
        ).fetchall()
    return [_summary_dict(row) for row in rows]


def get_board_summary(user_id: str, board_id: str) -> Optional[dict[str, Any]]:
    with closing(connect()) as connection:
        row = connection.execute(
            BOARD_SUMMARY_QUERY + "WHERE boards.user_id = ? AND boards.id = ?",
            (user_id, board_id),
        ).fetchone()
    return _summary_dict(row) if row else None


def create_board(user_id: str, name: str) -> dict[str, Any]:
    with closing(connect()) as connection, connection:
        board_id = _insert_new_board(connection, user_id, name)
    summary = get_board_summary(user_id, board_id)
    assert summary is not None
    return summary


def rename_board(user_id: str, board_id: str, name: str) -> dict[str, Any]:
    with closing(connect()) as connection, connection:
        old_name = connection.execute(
            "SELECT name FROM boards WHERE id = ?", (board_id,)
        ).fetchone()[0]
        connection.execute(
            "UPDATE boards SET name = ?, updated_at = ? WHERE id = ?",
            (name, _now(), board_id),
        )
        if name != old_name:
            _record_activity(
                connection,
                board_id,
                "user",
                [f'Renamed board "{old_name}" to "{name}"'],
            )
    summary = get_board_summary(user_id, board_id)
    assert summary is not None
    return summary


def delete_board(board_id: str) -> None:
    with closing(connect()) as connection, connection:
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def get_board(board_id: str) -> dict[str, Any]:
    with closing(connect()) as connection:
        return _read_board(connection, board_id)


def save_board(board_id: str, board: dict[str, Any], source: str = "user") -> None:
    """Replace a board's contents and record what changed, in one transaction."""
    with closing(connect()) as connection, connection:
        messages = describe_changes(_read_board(connection, board_id), board)
        connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        connection.execute("DELETE FROM board_columns WHERE board_id = ?", (board_id,))
        _insert_board_contents(connection, board_id, board)
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?", (_now(), board_id)
        )
        _record_activity(connection, board_id, source, messages)


# Activity


def _record_activity(
    connection: sqlite3.Connection, board_id: str, source: str, messages: list[str]
) -> None:
    if not messages:
        return
    now = _now()
    connection.executemany(
        """
        INSERT INTO activity (board_id, source, message, created_at)
        VALUES (?, ?, ?, ?)
        """,
        [(board_id, source, message, now) for message in messages],
    )
    connection.execute(
        """
        DELETE FROM activity WHERE board_id = ? AND id NOT IN (
            SELECT id FROM activity WHERE board_id = ? ORDER BY id DESC LIMIT ?
        )
        """,
        (board_id, board_id, ACTIVITY_RETENTION),
    )


def list_activity(board_id: str, limit: int) -> list[dict[str, Any]]:
    with closing(connect()) as connection:
        rows = connection.execute(
            """
            SELECT id, source, message, created_at FROM activity
            WHERE board_id = ? ORDER BY id DESC LIMIT ?
            """,
            (board_id, limit),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "source": row["source"],
            "message": row["message"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]

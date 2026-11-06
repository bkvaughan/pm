import sqlite3
from pathlib import Path

from app import database
from app.initial_data import INITIAL_BOARD
from app.security import hash_password, verify_password

LEGACY_SCHEMA = """
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE);
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE board_columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    position INTEGER NOT NULL
);
INSERT INTO users VALUES ('user', 'user');
INSERT INTO boards VALUES ('board-user', 'user');
INSERT INTO board_columns VALUES ('col-a', 'board-user', 'Saved A', 0);
INSERT INTO board_columns VALUES ('col-b', 'board-user', 'Saved B', 1);
INSERT INTO cards VALUES ('card-x', 'board-user', 'col-b', 'Kept', 'Kept card', 0);
"""


def demo_board(db_path: Path) -> dict:
    with sqlite3.connect(db_path) as connection:
        board_id = connection.execute("SELECT id FROM boards").fetchone()[0]
    return database.get_board(board_id)


def test_initialize_creates_and_seeds_a_new_database(db_path: Path) -> None:
    database.initialize_database()

    assert demo_board(db_path) == INITIAL_BOARD
    user, password_hash = database.get_credentials("user")
    assert verify_password("password", password_hash)


def test_initialize_is_idempotent(db_path: Path) -> None:
    database.initialize_database()
    database.initialize_database()

    with sqlite3.connect(db_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1


def test_initialize_does_not_recreate_a_deleted_demo_user(db_path: Path) -> None:
    database.initialize_database()
    user, _ = database.get_credentials("user")
    database.delete_user(user["id"])

    database.initialize_database()

    assert database.get_credentials("user") is None


def test_initialize_migrates_the_single_board_schema(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(LEGACY_SCHEMA)

    database.initialize_database()

    assert demo_board(db_path) == {
        "columns": [
            {"id": "col-a", "title": "Saved A", "cardIds": [], "wipLimit": None},
            {"id": "col-b", "title": "Saved B", "cardIds": ["card-x"], "wipLimit": None},
        ],
        "cards": {
            "card-x": {
                "id": "card-x",
                "title": "Kept",
                "details": "Kept card",
                "priority": None,
                "dueDate": None,
                "labels": [],
                "checklist": [],
                "archived": False,
            }
        },
    }
    assert database.get_credentials("user") is not None


def test_password_hashes_are_salted_and_verifiable() -> None:
    first = hash_password("secret-pass")
    second = hash_password("secret-pass")

    assert first != second
    assert verify_password("secret-pass", first)
    assert not verify_password("wrong-pass", first)


# Column definitions added by each migration, removed to rebuild older schemas.
ADDED_IN = {
    2: "    priority TEXT,\n    due_date TEXT,\n    labels TEXT NOT NULL DEFAULT '[]',\n",
    3: "    wip_limit INTEGER,\n",
    4: database.SCHEMA[database.SCHEMA.index("CREATE TABLE activity") :],
    5: "    checklist TEXT NOT NULL DEFAULT '[]',\n",
    6: "    archived INTEGER NOT NULL DEFAULT 0,\n",
}


def schema_at(version: int) -> str:
    schema = database.SCHEMA
    for added_version, definition in ADDED_IN.items():
        if added_version > version:
            assert definition in schema
            schema = schema.replace(definition, "")
    return schema


def test_every_migration_has_a_schema_fixture() -> None:
    assert sorted(ADDED_IN) == sorted(database.MIGRATIONS)
    assert database.SCHEMA_VERSION == max(database.MIGRATIONS)


def test_initialize_upgrades_a_version_1_database(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(schema_at(1))
        connection.executescript(
            """
            INSERT INTO users VALUES ('user-1', 'old', 'Old', 'hash', '2026-01-01');
            INSERT INTO boards VALUES ('board-1', 'user-1', 'Old board', '2026-01-01',
                '2026-01-01');
            INSERT INTO board_columns VALUES ('board-1', 'col-1', 'To Do', 0);
            INSERT INTO cards VALUES ('board-1', 'card-1', 'col-1', 'Old', 'Card', 0);
            PRAGMA user_version = 1;
            """
        )

    database.initialize_database()

    assert database.get_board("board-1")["cards"]["card-1"] == {
        "id": "card-1",
        "title": "Old",
        "details": "Card",
        "priority": None,
        "dueDate": None,
        "labels": [],
        "checklist": [],
        "archived": False,
    }
    with sqlite3.connect(db_path) as connection:
        assert (
            connection.execute("PRAGMA user_version").fetchone()[0]
            == database.SCHEMA_VERSION
        )
        # Existing data is kept and the demo user is not seeded into it.
        assert connection.execute("SELECT username FROM users").fetchall() == [("old",)]


def test_initialize_upgrades_a_version_2_database(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(schema_at(2))
        connection.executescript(
            """
            INSERT INTO users VALUES ('user-1', 'old', 'Old', 'hash', '2026-01-01');
            INSERT INTO boards VALUES ('board-1', 'user-1', 'Old board', '2026-01-01',
                '2026-01-01');
            INSERT INTO board_columns VALUES ('board-1', 'col-1', 'To Do', 0);
            PRAGMA user_version = 2;
            """
        )

    database.initialize_database()

    assert database.get_board("board-1")["columns"] == [
        {"id": "col-1", "title": "To Do", "cardIds": [], "wipLimit": None}
    ]


def test_initialize_upgrades_a_version_3_database(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(schema_at(3))
        connection.executescript(
            """
            INSERT INTO users VALUES ('user-1', 'old', 'Old', 'hash', '2026-01-01');
            INSERT INTO boards VALUES ('board-1', 'user-1', 'Old board', '2026-01-01',
                '2026-01-01');
            PRAGMA user_version = 3;
            """
        )

    database.initialize_database()

    assert database.list_activity("board-1", 10) == []
    database.rename_board("user-1", "board-1", "Renamed")
    assert [entry["message"] for entry in database.list_activity("board-1", 10)] == [
        'Renamed board "Old board" to "Renamed"'
    ]


def test_initialize_upgrades_a_version_4_database(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(schema_at(4))
        connection.executescript(
            """
            INSERT INTO users VALUES ('user-1', 'old', 'Old', 'hash', '2026-01-01');
            INSERT INTO boards VALUES ('board-1', 'user-1', 'Old board', '2026-01-01',
                '2026-01-01');
            INSERT INTO board_columns VALUES ('board-1', 'col-1', 'To Do', NULL, 0);
            INSERT INTO cards VALUES ('board-1', 'card-1', 'col-1', 'Old', 'Card',
                'high', NULL, '["Ops"]', 0);
            PRAGMA user_version = 4;
            """
        )

    database.initialize_database()

    card = database.get_board("board-1")["cards"]["card-1"]
    assert card["labels"] == ["Ops"]
    assert card["checklist"] == []


def test_initialize_upgrades_a_version_5_database(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(schema_at(5))
        connection.executescript(
            """
            INSERT INTO users VALUES ('user-1', 'old', 'Old', 'hash', '2026-01-01');
            INSERT INTO boards VALUES ('board-1', 'user-1', 'Old board', '2026-01-01',
                '2026-01-01');
            INSERT INTO board_columns VALUES ('board-1', 'col-1', 'To Do', NULL, 0);
            INSERT INTO cards VALUES ('board-1', 'card-1', 'col-1', 'Old', 'Card',
                NULL, NULL, '[]', '[{"id": "i", "text": "Step", "done": true}]', 0);
            PRAGMA user_version = 5;
            """
        )

    database.initialize_database()

    card = database.get_board("board-1")["cards"]["card-1"]
    assert card["checklist"] == [{"id": "i", "text": "Step", "done": True}]
    assert card["archived"] is False
    assert database.list_boards("user-1")[0]["cardCount"] == 1

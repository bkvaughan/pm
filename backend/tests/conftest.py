from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app

ClientFactory = Callable[[], TestClient]


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "pm.sqlite3"
    monkeypatch.setattr(database, "DB_PATH", path)
    return path


@pytest.fixture
def make_client(db_path: Path) -> Iterator[ClientFactory]:
    """Create independent clients (separate cookie jars) sharing one database."""
    clients: list[TestClient] = []

    def factory() -> TestClient:
        test_client = TestClient(app)
        test_client.__enter__()
        clients.append(test_client)
        return test_client

    yield factory
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture
def client(make_client: ClientFactory) -> TestClient:
    """A signed-out client."""
    return make_client()


@pytest.fixture
def demo_client(make_client: ClientFactory) -> TestClient:
    """A client signed in as the seeded demo user."""
    test_client = make_client()
    login(test_client, "user", "password")
    return test_client


def register(
    test_client: TestClient,
    username: str = "alice",
    password: str = "correct-horse",
    display_name: str = "Alice",
) -> dict[str, Any]:
    response = test_client.post(
        "/api/auth/register",
        json={"username": username, "password": password, "displayName": display_name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def login(test_client: TestClient, username: str, password: str) -> dict[str, Any]:
    response = test_client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()


def first_board_id(test_client: TestClient) -> str:
    return test_client.get("/api/boards").json()[0]["id"]

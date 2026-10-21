from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "pm.sqlite3")
    with TestClient(app) as test_client:
        yield test_client


def test_root_serves_frontend_index(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban Studio" in response.text


def test_api_hello_returns_success_message(client: TestClient) -> None:
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "hello from PM MVP", "status": "ok"}


def test_health_route(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_board_creates_database_and_seeds_demo_board(
    client: TestClient, tmp_path: Path
) -> None:
    response = client.get("/api/board")

    assert response.status_code == 200
    assert len(response.json()["columns"]) == 5
    assert len(response.json()["cards"]) == 8
    assert (tmp_path / "pm.sqlite3").exists()


def test_put_board_persists_renames_adds_moves_and_deletes_cards(
    client: TestClient,
) -> None:
    board = client.get("/api/board").json()
    board["columns"][0]["title"] = "Ideas"
    board["columns"][0]["cardIds"].remove("card-2")
    board["columns"][1]["cardIds"].append("card-2")
    board["columns"][0]["cardIds"].append("card-new")
    board["cards"]["card-new"] = {
        "id": "card-new",
        "title": "New work",
        "details": "Added through the API.",
    }
    board["columns"][2]["cardIds"].remove("card-5")
    del board["cards"]["card-5"]

    response = client.put("/api/board", json=board)

    assert response.status_code == 200
    assert response.json() == board
    assert client.get("/api/board").json() == board


def test_put_board_rejects_cards_not_listed_in_exactly_one_column(
    client: TestClient,
) -> None:
    board = client.get("/api/board").json()
    board["columns"][0]["cardIds"].remove("card-1")

    response = client.put("/api/board", json=board)

    assert response.status_code == 422

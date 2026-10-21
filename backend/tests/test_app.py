from collections.abc import Iterator
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import OPENROUTER_MODEL, OPENROUTER_URL, app


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


def test_ai_completion_sends_prompt_to_openrouter(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    original_async_client = httpx.AsyncClient

    def openrouter_response(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == OPENROUTER_URL
        assert request.headers["Authorization"] == "Bearer test-key"
        assert json.loads(request.read()) == {
            "model": OPENROUTER_MODEL,
            "messages": [{"role": "user", "content": "2+2"}],
        }
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "4"}}]},
        )

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_async_client(
            transport=httpx.MockTransport(openrouter_response),
            **kwargs,
        ),
    )

    response = client.post("/api/ai/completion", json={"prompt": "2+2"})

    assert response.status_code == 200
    assert response.json() == {"answer": "4", "model": OPENROUTER_MODEL}


def test_ai_completion_reports_missing_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post("/api/ai/completion", json={"prompt": "2+2"})

    assert response.status_code == 503
    assert response.json()["detail"] == "OPENROUTER_API_KEY is not configured."


@pytest.mark.parametrize("status_code", [401, 403])
def test_ai_completion_reports_invalid_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "invalid-test-key")
    original_async_client = httpx.AsyncClient

    def rejected_key(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code)

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_async_client(
            transport=httpx.MockTransport(rejected_key),
            **kwargs,
        ),
    )

    response = client.post("/api/ai/completion", json={"prompt": "2+2"})

    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter rejected the API key."


def test_ai_completion_reports_timeout(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    original_async_client = httpx.AsyncClient

    def timeout(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("test timeout")

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_async_client(
            transport=httpx.MockTransport(timeout),
            **kwargs,
        ),
    )

    response = client.post("/api/ai/completion", json={"prompt": "2+2"})

    assert response.status_code == 504
    assert response.json()["detail"] == "OpenRouter request timed out."

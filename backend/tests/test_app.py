from collections.abc import Iterator
import json
from pathlib import Path
from typing import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import OPENROUTER_MODEL, OPENROUTER_URL, app


def mock_openrouter(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], httpx.Response],
) -> None:
    original_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_async_client(
            transport=httpx.MockTransport(handler),
            **kwargs,
        ),
    )


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

    mock_openrouter(monkeypatch, openrouter_response)

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

    def rejected_key(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code)

    mock_openrouter(monkeypatch, rejected_key)

    response = client.post("/api/ai/completion", json={"prompt": "2+2"})

    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter rejected the API key."


def test_ai_completion_reports_timeout(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def timeout(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("test timeout")

    mock_openrouter(monkeypatch, timeout)

    response = client.post("/api/ai/completion", json={"prompt": "2+2"})

    assert response.status_code == 504
    assert response.json()["detail"] == "OpenRouter request timed out."


def test_ai_assistant_answers_without_changing_board(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get("/api/board").json()

    def assistant_response(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.read())
        assert body["model"] == OPENROUTER_MODEL
        assert body["response_format"] == {"type": "json_object"}
        assert [message["role"] for message in body["messages"]] == [
            "system",
            "user",
            "assistant",
            "user",
        ]
        assert "Current board JSON:" in body["messages"][-1]["content"]
        assert "Which card is in Backlog?" in body["messages"][-1]["content"]
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"reply": "Align roadmap themes.", "mutations": []}
                            )
                        }
                    }
                ]
            },
        )

    mock_openrouter(monkeypatch, assistant_response)
    response = client.post(
        "/api/ai/assistant",
        json={
            "board": board,
            "message": "Which card is in Backlog?",
            "history": [
                {"role": "user", "content": "I am reviewing the project."},
                {"role": "assistant", "content": "Sure."},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Align roadmap themes.",
        "board": None,
        "model": OPENROUTER_MODEL,
    }
    assert database.get_board() == board


def test_ai_assistant_applies_and_persists_explicit_mutations(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get("/api/board").json()
    mutations = [
        {"action": "edit_card", "card_id": "card-3", "title": "Updated prototype"},
        {"action": "move_card", "card_id": "card-1", "column_id": "col-discovery"},
        {"action": "rename_column", "column_id": "col-backlog", "title": "Ideas"},
        {
            "action": "create_card",
            "column_id": "col-done",
            "title": "Review metrics",
            "details": "Check the launch results.",
        },
    ]

    def assistant_response(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"reply": "Updated the board.", "mutations": mutations}
                            )
                        }
                    }
                ]
            },
        )

    mock_openrouter(monkeypatch, assistant_response)
    response = client.post(
        "/api/ai/assistant",
        json={"board": board, "message": "Update the board."},
    )

    assert response.status_code == 200
    updated_board = response.json()["board"]
    assert response.json()["reply"] == "Updated the board."
    assert response.json()["model"] == OPENROUTER_MODEL
    assert updated_board["columns"][0]["title"] == "Ideas"
    assert "card-1" not in updated_board["columns"][0]["cardIds"]
    assert "card-1" in updated_board["columns"][1]["cardIds"]
    assert updated_board["cards"]["card-3"]["title"] == "Updated prototype"
    created_card_ids = set(updated_board["cards"]) - set(board["cards"])
    assert len(created_card_ids) == 1
    created_card_id = created_card_ids.pop()
    assert updated_board["cards"][created_card_id] == {
        "id": created_card_id,
        "title": "Review metrics",
        "details": "Check the launch results.",
    }
    assert created_card_id in updated_board["columns"][4]["cardIds"]
    assert database.get_board() == updated_board


@pytest.mark.parametrize(
    "assistant_content",
    [
        "not JSON",
        json.dumps({"reply": "Missing mutations"}),
        json.dumps(
            {
                "reply": "Incomplete mutation",
                "mutations": [{"action": "move_card", "card_id": "card-1"}],
            }
        ),
    ],
)
def test_ai_assistant_rejects_invalid_structured_output(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    assistant_content: str,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get("/api/board").json()

    def assistant_response(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": assistant_content}}]},
        )

    mock_openrouter(monkeypatch, assistant_response)
    response = client.post(
        "/api/ai/assistant",
        json={"board": board, "message": "Please update the board."},
    )

    assert response.status_code == 502
    assert "invalid assistant response" in response.json()["detail"]
    assert database.get_board() == board


def test_ai_assistant_rejects_mutations_for_unknown_board_ids(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get("/api/board").json()

    def assistant_response(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "reply": "Moved the card.",
                                    "mutations": [
                                        {
                                            "action": "move_card",
                                            "card_id": "not-on-board",
                                            "column_id": "col-done",
                                        }
                                    ],
                                }
                            )
                        }
                    }
                ]
            },
        )

    mock_openrouter(monkeypatch, assistant_response)
    response = client.post(
        "/api/ai/assistant",
        json={"board": board, "message": "Move the missing card."},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter returned an invalid board mutation."
    assert database.get_board() == board

from collections.abc import Callable
import json
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient

from app.assistant import OPENROUTER_MODEL, OPENROUTER_URL
from conftest import first_board_id


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
def client(demo_client: TestClient) -> TestClient:
    """Assistant tests run as the signed-in demo user."""
    return demo_client


def assistant_url(client: TestClient) -> str:
    return f"/api/boards/{first_board_id(client)}/assistant"


def board_url(client: TestClient) -> str:
    return f"/api/boards/{first_board_id(client)}"


def post_assistant(client: TestClient) -> httpx.Response:
    return client.post(assistant_url(client), json={"message": "Hello"})


def test_ai_assistant_reports_missing_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = post_assistant(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "OPENROUTER_API_KEY is not configured."


@pytest.mark.parametrize("status_code", [401, 403])
def test_ai_assistant_reports_invalid_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "invalid-test-key")

    def rejected_key(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code)

    mock_openrouter(monkeypatch, rejected_key)

    response = post_assistant(client)

    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter rejected the API key."


def test_ai_assistant_reports_timeout(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def timeout(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("test timeout")

    mock_openrouter(monkeypatch, timeout)

    response = post_assistant(client)

    assert response.status_code == 504
    assert response.json()["detail"] == "OpenRouter request timed out."


def test_ai_assistant_answers_without_changing_board(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get(board_url(client)).json()

    def assistant_response(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == OPENROUTER_URL
        assert request.headers["Authorization"] == "Bearer test-key"
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
        assistant_url(client),
        json={
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
    assert client.get(board_url(client)).json() == board


def test_ai_assistant_applies_and_persists_explicit_mutations(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get(board_url(client)).json()
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
        assistant_url(client),
        json={"message": "Update the board."},
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
        "priority": None,
        "dueDate": None,
        "labels": [],
        "checklist": [],
        "archived": False,
    }
    assert created_card_id in updated_board["columns"][4]["cardIds"]
    assert client.get(board_url(client)).json() == updated_board


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
    board = client.get(board_url(client)).json()

    def assistant_response(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": assistant_content}}]},
        )

    mock_openrouter(monkeypatch, assistant_response)
    response = client.post(
        assistant_url(client),
        json={"message": "Please update the board."},
    )

    assert response.status_code == 502
    assert "invalid assistant response" in response.json()["detail"]
    assert client.get(board_url(client)).json() == board


def test_ai_assistant_rejects_mutations_for_unknown_board_ids(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get(board_url(client)).json()

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
        assistant_url(client),
        json={"message": "Move the missing card."},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter returned an invalid board mutation."
    assert client.get(board_url(client)).json() == board


def test_ai_assistant_uses_the_persisted_board(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = client.get(board_url(client)).json()
    board["columns"][0]["title"] = "Saved title"
    client.put(board_url(client), json=board)

    def assistant_response(request: httpx.Request) -> httpx.Response:
        assert "Saved title" in json.loads(request.read())["messages"][-1]["content"]
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": json.dumps({"reply": "Ok.", "mutations": []})}}
                ]
            },
        )

    mock_openrouter(monkeypatch, assistant_response)
    response = post_assistant(client)

    assert response.status_code == 200
    assert response.json()["reply"] == "Ok."


def test_ai_assistant_only_changes_the_requested_board(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    roadmap = client.get(board_url(client)).json()
    other = client.post("/api/boards", json={"name": "Other"}).json()
    other_board = client.get(f"/api/boards/{other['id']}").json()
    column_id = other_board["columns"][0]["id"]

    def assistant_response(request: httpx.Request) -> httpx.Response:
        assert column_id in json.loads(request.read())["messages"][-1]["content"]
        mutation = {
            "action": "rename_column",
            "column_id": column_id,
            "title": "Renamed",
        }
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"reply": "Done.", "mutations": [mutation]}
                            )
                        }
                    }
                ]
            },
        )

    mock_openrouter(monkeypatch, assistant_response)
    response = client.post(
        f"/api/boards/{other['id']}/assistant", json={"message": "Rename it."}
    )

    assert response.status_code == 200
    saved = client.get(f"/api/boards/{other['id']}").json()
    assert saved["columns"][0]["title"] == "Renamed"
    assert client.get(board_url(client)).json() == roadmap


def respond_with(
    monkeypatch: pytest.MonkeyPatch, mutations: list[dict], captured: list | None = None
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def assistant_response(request: httpx.Request) -> httpx.Response:
        if captured is not None:
            captured.append(json.loads(request.read()))
        content = json.dumps({"reply": "Done.", "mutations": mutations})
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    mock_openrouter(monkeypatch, assistant_response)


def test_ai_assistant_creates_cards_with_details(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    respond_with(
        monkeypatch,
        [
            {
                "action": "create_card",
                "column_id": "col-backlog",
                "title": "Fix login bug",
                "details": "Users report a timeout.",
                "priority": "high",
                "due_date": "2026-12-01",
                "labels": ["Bug", "bug", "Auth"],
                "checklist": ["Reproduce", " Add a test "],
            }
        ],
    )

    response = client.post(assistant_url(client), json={"message": "Add it."})

    board = response.json()["board"]
    created_id = board["columns"][0]["cardIds"][-1]
    card = dict(board["cards"][created_id])
    items = card.pop("checklist")
    assert card == {
        "id": created_id,
        "title": "Fix login bug",
        "details": "Users report a timeout.",
        "priority": "high",
        "dueDate": "2026-12-01",
        "labels": ["Bug", "Auth"],
        "archived": False,
    }
    assert [(item["text"], item["done"]) for item in items] == [
        ("Reproduce", False),
        ("Add a test", False),
    ]
    assert len({item["id"] for item in items}) == 2
    assert client.get(board_url(client)).json() == board


def test_ai_assistant_edits_and_clears_card_details(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    respond_with(
        monkeypatch,
        [
            {"action": "edit_card", "card_id": "card-1", "priority": None},
            {"action": "edit_card", "card_id": "card-2", "due_date": "2026-11-30"},
            {"action": "edit_card", "card_id": "card-3", "labels": []},
        ],
    )

    response = client.post(assistant_url(client), json={"message": "Update."})

    cards = response.json()["board"]["cards"]
    assert cards["card-1"]["priority"] is None
    assert cards["card-1"]["title"] == "Align roadmap themes"
    assert cards["card-2"]["dueDate"] == "2026-11-30"
    assert cards["card-2"]["priority"] == "medium"
    assert cards["card-3"]["labels"] == []


@pytest.mark.parametrize(
    "mutation",
    [
        {"action": "edit_card", "card_id": "card-1"},
        {"action": "edit_card", "card_id": "card-1", "title": None},
        {"action": "edit_card", "card_id": "card-1", "labels": None},
        {"action": "edit_card", "card_id": "card-1", "archived": None},
        {"action": "edit_card", "card_id": "card-1", "priority": "urgent"},
        {"action": "edit_card", "card_id": "card-1", "due_date": "soon"},
    ],
)
def test_ai_assistant_rejects_invalid_card_edits(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mutation: dict
) -> None:
    before = client.get(board_url(client)).json()
    respond_with(monkeypatch, [mutation])

    response = client.post(assistant_url(client), json={"message": "Edit."})

    assert response.status_code == 502
    assert client.get(board_url(client)).json() == before


def test_ai_assistant_prompt_includes_today(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: list = []
    respond_with(monkeypatch, [], captured)

    client.post(assistant_url(client), json={"message": "What is due?"})

    system_prompt = captured[0]["messages"][0]["content"]
    assert f"Today's date is {date.today().isoformat()}." in system_prompt
    assert '"due_date":"YYYY-MM-DD"' in system_prompt


def test_ai_assistant_sets_and_clears_wip_limits(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    respond_with(
        monkeypatch,
        [
            {"action": "set_wip_limit", "column_id": "col-backlog", "wip_limit": 4},
            {"action": "set_wip_limit", "column_id": "col-progress", "wip_limit": None},
        ],
    )

    response = client.post(assistant_url(client), json={"message": "Set limits."})

    columns = client.get(board_url(client)).json()["columns"]
    assert response.json()["board"]["columns"] == columns
    assert columns[0]["wipLimit"] == 4
    assert columns[2]["wipLimit"] is None


@pytest.mark.parametrize(
    "mutation",
    [
        {"action": "set_wip_limit", "column_id": "col-backlog", "wip_limit": 0},
        {"action": "set_wip_limit", "column_id": "col-backlog"},
        {"action": "set_wip_limit", "column_id": "missing", "wip_limit": 2},
    ],
)
def test_ai_assistant_rejects_invalid_wip_limits(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mutation: dict
) -> None:
    before = client.get(board_url(client)).json()
    respond_with(monkeypatch, [mutation])

    response = client.post(assistant_url(client), json={"message": "Limit."})

    assert response.status_code == 502
    assert client.get(board_url(client)).json() == before


def test_ai_assistant_checks_checklist_items(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    respond_with(
        monkeypatch,
        [
            {"action": "check_item", "card_id": "card-5", "item_id": "item-2", "done": True},
            {"action": "check_item", "card_id": "card-5", "item_id": "item-1", "done": False},
        ],
    )

    response = client.post(assistant_url(client), json={"message": "Update tasks."})

    items = client.get(board_url(client)).json()["cards"]["card-5"]["checklist"]
    assert response.json()["board"]["cards"]["card-5"]["checklist"] == items
    assert [item["done"] for item in items] == [False, True]
    messages = [
        entry["message"]
        for entry in client.get(f"{board_url(client)}/activity").json()[:2]
    ]
    assert messages == [
        'Checked off "Set spacing tokens" on "Design card layout"',
        'Unchecked "Pick a type scale" on "Design card layout"',
    ]


def test_ai_assistant_archives_and_restores_cards(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    board = client.get(board_url(client)).json()
    board["cards"]["card-2"]["archived"] = True
    client.put(board_url(client), json=board)
    respond_with(
        monkeypatch,
        [
            {"action": "edit_card", "card_id": "card-1", "archived": True},
            {"action": "edit_card", "card_id": "card-2", "archived": False},
        ],
    )

    client.post(assistant_url(client), json={"message": "Swap them."})

    cards = client.get(board_url(client)).json()["cards"]
    assert cards["card-1"]["archived"] is True
    assert cards["card-2"]["archived"] is False
    messages = [
        entry["message"]
        for entry in client.get(f"{board_url(client)}/activity").json()[:2]
    ]
    assert messages == [
        'Restored card "Gather customer signals"',
        'Archived card "Align roadmap themes"',
    ]


@pytest.mark.parametrize(
    "mutation",
    [
        {"action": "check_item", "card_id": "card-5", "item_id": "missing", "done": True},
        {"action": "check_item", "card_id": "missing", "item_id": "item-1", "done": True},
        {"action": "check_item", "card_id": "card-5", "item_id": "item-1"},
        {"action": "create_card", "column_id": "col-backlog", "title": "T",
         "details": "", "checklist": [""]},
    ],
    ids=["unknown-item", "unknown-card", "missing-done", "blank-item"],
)
def test_ai_assistant_rejects_invalid_checklist_mutations(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mutation: dict
) -> None:
    before = client.get(board_url(client)).json()
    respond_with(monkeypatch, [mutation])

    response = client.post(assistant_url(client), json={"message": "Check."})

    assert response.status_code == 502
    assert client.get(board_url(client)).json() == before


def test_ai_assistant_changes_are_recorded_as_assistant_activity(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    respond_with(
        monkeypatch,
        [{"action": "move_card", "card_id": "card-1", "column_id": "col-done"}],
    )

    client.post(assistant_url(client), json={"message": "Move it."})

    latest = client.get(f"{board_url(client)}/activity").json()[0]
    assert latest["source"] == "assistant"
    assert latest["message"] == (
        'Moved card "Align roadmap themes" from "Backlog" to "Done"'
    )

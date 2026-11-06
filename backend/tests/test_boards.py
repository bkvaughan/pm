from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.initial_data import INITIAL_BOARD
from conftest import ClientFactory, first_board_id, register


def test_root_serves_frontend_index(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban Studio" in response.text


def test_health_route(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_demo_user_has_the_seeded_board(demo_client: TestClient) -> None:
    boards = demo_client.get("/api/boards").json()

    assert [board["name"] for board in boards] == ["Product Roadmap"]
    assert boards[0]["cardCount"] == 8
    assert demo_client.get(f"/api/boards/{boards[0]['id']}").json() == INITIAL_BOARD


def test_new_users_get_an_empty_starter_board(client: TestClient) -> None:
    register(client)

    boards = client.get("/api/boards").json()
    board = client.get(f"/api/boards/{boards[0]['id']}").json()

    assert [summary["name"] for summary in boards] == ["My First Board"]
    assert [column["title"] for column in board["columns"]] == [
        "To Do",
        "In Progress",
        "Review",
        "Done",
    ]
    assert board["cards"] == {}


def test_create_list_rename_and_delete_boards(demo_client: TestClient) -> None:
    created = demo_client.post("/api/boards", json={"name": "  Launch plan "})

    assert created.status_code == 201
    board = created.json()
    assert board["name"] == "Launch plan"
    assert board["cardCount"] == 0
    assert [summary["name"] for summary in demo_client.get("/api/boards").json()] == [
        "Product Roadmap",
        "Launch plan",
    ]

    renamed = demo_client.patch(f"/api/boards/{board['id']}", json={"name": "Launch"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Launch"
    assert renamed.json()["updatedAt"] >= board["updatedAt"]

    assert demo_client.delete(f"/api/boards/{board['id']}").status_code == 204
    assert demo_client.get(f"/api/boards/{board['id']}").status_code == 404
    assert len(demo_client.get("/api/boards").json()) == 1


@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_board_names_are_validated(demo_client: TestClient, name: str) -> None:
    assert demo_client.post("/api/boards", json={"name": name}).status_code == 422


def test_put_board_persists_renames_adds_moves_and_deletes_cards(
    demo_client: TestClient,
) -> None:
    board_id = first_board_id(demo_client)
    board = demo_client.get(f"/api/boards/{board_id}").json()
    board["columns"][0]["title"] = "Ideas"
    board["columns"][0]["cardIds"].remove("card-2")
    board["columns"][1]["cardIds"].append("card-2")
    board["columns"][0]["cardIds"].append("card-new")
    board["cards"]["card-new"] = {
        "id": "card-new",
        "title": "New work",
        "details": "Added through the API.",
        "priority": "high",
        "dueDate": "2026-12-01",
        "labels": ["API"],
        "checklist": [{"id": "item-a", "text": "Write it", "done": True}],
        "archived": False,
    }
    board["columns"][2]["cardIds"].remove("card-5")
    del board["cards"]["card-5"]

    response = demo_client.put(f"/api/boards/{board_id}", json=board)

    assert response.status_code == 200
    assert response.json() == board
    assert demo_client.get(f"/api/boards/{board_id}").json() == board
    summary = demo_client.get("/api/boards").json()[0]
    assert summary["cardCount"] == 8
    assert summary["updatedAt"] > summary["createdAt"]


def test_put_board_supports_adding_and_removing_columns(
    demo_client: TestClient,
) -> None:
    board_id = first_board_id(demo_client)
    board = demo_client.get(f"/api/boards/{board_id}").json()
    removed = board["columns"].pop()
    for card_id in removed["cardIds"]:
        del board["cards"][card_id]
    board["columns"].append({"id": "col-blocked", "title": "Blocked", "cardIds": []})

    demo_client.put(f"/api/boards/{board_id}", json=board)

    titles = [
        column["title"]
        for column in demo_client.get(f"/api/boards/{board_id}").json()["columns"]
    ]
    assert titles == ["Backlog", "Discovery", "In Progress", "Review", "Blocked"]


def mutate(board: dict[str, Any], kind: str) -> None:
    if kind == "unlisted card":
        board["columns"][0]["cardIds"].remove("card-1")
    elif kind == "duplicate card":
        board["columns"][1]["cardIds"].append("card-1")
    elif kind == "duplicate column":
        board["columns"][1]["id"] = board["columns"][0]["id"]
    elif kind == "mismatched key":
        board["cards"]["card-1"]["id"] = "card-other"
    elif kind == "no columns":
        board["columns"] = []
        board["cards"] = {}
    elif kind == "extra field":
        board["owner"] = "someone"


@pytest.mark.parametrize(
    "kind",
    [
        "unlisted card",
        "duplicate card",
        "duplicate column",
        "mismatched key",
        "no columns",
        "extra field",
    ],
)
def test_put_board_rejects_invalid_boards(demo_client: TestClient, kind: str) -> None:
    board_id = first_board_id(demo_client)
    board = demo_client.get(f"/api/boards/{board_id}").json()
    mutate(board, kind)

    assert demo_client.put(f"/api/boards/{board_id}", json=board).status_code == 422
    assert demo_client.get(f"/api/boards/{board_id}").json() == INITIAL_BOARD


def test_boards_can_reuse_column_and_card_ids(demo_client: TestClient) -> None:
    second = demo_client.post("/api/boards", json={"name": "Copy"}).json()

    response = demo_client.put(f"/api/boards/{second['id']}", json=INITIAL_BOARD)

    assert response.status_code == 200
    first_id = first_board_id(demo_client)
    assert demo_client.get(f"/api/boards/{first_id}").json() == INITIAL_BOARD
    assert demo_client.get(f"/api/boards/{second['id']}").json() == INITIAL_BOARD


@pytest.mark.parametrize(
    ("method", "suffix", "payload"),
    [
        ("get", "", None),
        ("put", "", INITIAL_BOARD),
        ("patch", "", {"name": "Stolen"}),
        ("delete", "", None),
        ("post", "/assistant", {"message": "Hello"}),
    ],
)
def test_users_cannot_access_another_users_boards(
    make_client: ClientFactory,
    method: str,
    suffix: str,
    payload: dict[str, Any] | None,
) -> None:
    owner = make_client()
    register(owner, username="owner")
    board_id = first_board_id(owner)
    before = owner.get(f"/api/boards/{board_id}").json()
    intruder = make_client()
    register(intruder, username="intruder")

    response = intruder.request(method, f"/api/boards/{board_id}{suffix}", json=payload)

    assert response.status_code == 404
    assert response.json()["detail"] == "Board not found."
    assert owner.get(f"/api/boards/{board_id}").json() == before
    assert owner.get("/api/boards").json()[0]["name"] == "My First Board"
    assert [board["id"] for board in intruder.get("/api/boards").json()] != [board_id]


def single_card_board(**card_fields: Any) -> dict[str, Any]:
    return {
        "columns": [{"id": "col-1", "title": "To Do", "cardIds": ["card-1"]}],
        "cards": {"card-1": {"id": "card-1", "title": "Task", "details": "", **card_fields}},
    }


def test_card_fields_default_when_omitted(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)

    demo_client.put(f"/api/boards/{board_id}", json=single_card_board())

    card = demo_client.get(f"/api/boards/{board_id}").json()["cards"]["card-1"]
    assert card == {
        "id": "card-1",
        "title": "Task",
        "details": "",
        "priority": None,
        "dueDate": None,
        "labels": [],
        "checklist": [],
        "archived": False,
    }


def test_card_fields_round_trip(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)

    response = demo_client.put(
        f"/api/boards/{board_id}",
        json=single_card_board(
            priority="low", dueDate="2026-02-28", labels=[" Ops ", "ops", "Infra"]
        ),
    )

    card = demo_client.get(f"/api/boards/{board_id}").json()["cards"]["card-1"]
    assert response.json()["cards"]["card-1"] == card
    assert card["priority"] == "low"
    assert card["dueDate"] == "2026-02-28"
    assert card["labels"] == ["Ops", "Infra"]


def test_archived_cards_are_kept_but_not_counted(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)
    board = demo_client.get(f"/api/boards/{board_id}").json()
    board["cards"]["card-1"]["archived"] = True

    demo_client.put(f"/api/boards/{board_id}", json=board)

    saved = demo_client.get(f"/api/boards/{board_id}").json()
    assert saved["cards"]["card-1"]["archived"] is True
    # The card keeps its place in its column so a restore puts it back there.
    assert saved["columns"][0]["cardIds"] == ["card-1", "card-2"]
    summary = demo_client.get("/api/boards").json()[0]
    assert summary["cardCount"] == 7


def test_checklist_round_trip(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)
    checklist = [
        {"id": "item-1", "text": " Draft ", "done": True},
        {"id": "item-2", "text": "Review"},
    ]

    demo_client.put(
        f"/api/boards/{board_id}", json=single_card_board(checklist=checklist)
    )

    card = demo_client.get(f"/api/boards/{board_id}").json()["cards"]["card-1"]
    assert card["checklist"] == [
        {"id": "item-1", "text": "Draft", "done": True},
        {"id": "item-2", "text": "Review", "done": False},
    ]


@pytest.mark.parametrize(
    "card_fields",
    [
        {"priority": "urgent"},
        {"dueDate": "2026-13-45"},
        {"dueDate": "next week"},
        {"labels": [""]},
        {"labels": ["x" * 31]},
        {"labels": [f"label-{index}" for index in range(11)]},
        {"checklist": [{"id": "item-1", "text": " "}]},
        {"checklist": [{"id": "", "text": "Task"}]},
        {"checklist": [{"id": "item-1", "text": "x" * 201}]},
        {"checklist": [{"id": "item-1", "text": "A"}, {"id": "item-1", "text": "B"}]},
        {"checklist": [{"id": f"item-{index}", "text": "T"} for index in range(51)]},
        {"checklist": [{"id": "item-1", "text": "T", "done": True, "extra": 1}]},
    ],
)
def test_invalid_card_fields_are_rejected(
    demo_client: TestClient, card_fields: dict[str, Any]
) -> None:
    board_id = first_board_id(demo_client)

    response = demo_client.put(
        f"/api/boards/{board_id}", json=single_card_board(**card_fields)
    )

    assert response.status_code == 422
    assert demo_client.get(f"/api/boards/{board_id}").json() == INITIAL_BOARD


def test_column_wip_limits_round_trip(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)
    board = demo_client.get(f"/api/boards/{board_id}").json()
    assert [column["wipLimit"] for column in board["columns"]] == [None, None, 3, 2, None]
    board["columns"][0]["wipLimit"] = 1  # already over the limit: limits are advisory
    board["columns"][2]["wipLimit"] = None

    demo_client.put(f"/api/boards/{board_id}", json=board)

    saved = demo_client.get(f"/api/boards/{board_id}").json()
    assert [column["wipLimit"] for column in saved["columns"]] == [1, None, None, 2, None]


@pytest.mark.parametrize("wip_limit", [0, 100, -1, "three", 2.5])
def test_invalid_wip_limits_are_rejected(demo_client: TestClient, wip_limit: Any) -> None:
    board_id = first_board_id(demo_client)
    board = demo_client.get(f"/api/boards/{board_id}").json()
    board["columns"][0]["wipLimit"] = wip_limit

    assert demo_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_column_order_is_persisted(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)
    board = demo_client.get(f"/api/boards/{board_id}").json()
    board["columns"].reverse()

    demo_client.put(f"/api/boards/{board_id}", json=board)

    saved = demo_client.get(f"/api/boards/{board_id}").json()
    assert [column["id"] for column in saved["columns"]] == [
        "col-done",
        "col-review",
        "col-progress",
        "col-discovery",
        "col-backlog",
    ]
    assert saved == board

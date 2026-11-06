import copy
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import database
from app.activity import describe_changes
from app.initial_data import INITIAL_BOARD
from conftest import ClientFactory, first_board_id, register


def board() -> dict[str, Any]:
    return copy.deepcopy(INITIAL_BOARD)


def test_no_changes_produce_no_messages() -> None:
    assert describe_changes(board(), board()) == []


def test_reordering_cards_within_a_column_is_not_reported() -> None:
    new = board()
    new["columns"][0]["cardIds"].reverse()

    assert describe_changes(board(), new) == []


def test_card_create_edit_move_and_delete() -> None:
    new = board()
    new["cards"]["card-9"] = {
        "id": "card-9",
        "title": "Write docs",
        "details": "",
        "priority": None,
        "dueDate": None,
        "labels": [],
        "checklist": [],
    }
    new["columns"][4]["cardIds"].append("card-9")
    new["cards"]["card-1"]["title"] = "Align themes"
    new["cards"]["card-1"]["labels"] = ["Planning", "Q1"]
    new["columns"][1]["cardIds"].remove("card-3")
    new["columns"][3]["cardIds"].append("card-3")
    new["columns"][4]["cardIds"].remove("card-8")
    del new["cards"]["card-8"]

    # Card messages follow the card map's order; deletions come last.
    assert describe_changes(board(), new) == [
        'Edited card "Align roadmap themes" (title, labels)',
        'Moved card "Prototype analytics view" from "Discovery" to "Review"',
        'Created card "Write docs" in "Done"',
        'Deleted card "Close onboarding sprint"',
    ]


def test_checklist_toggles_are_reported_per_item() -> None:
    new = board()
    items = new["cards"]["card-5"]["checklist"]
    items[0]["done"] = False
    items[1]["done"] = True

    assert describe_changes(board(), new) == [
        'Unchecked "Pick a type scale" on "Design card layout"',
        'Checked off "Set spacing tokens" on "Design card layout"',
    ]


@pytest.mark.parametrize(
    "change",
    [
        lambda items: items.append({"id": "item-3", "text": "New", "done": False}),
        lambda items: items.pop(),
        lambda items: items.reverse(),
        lambda items: items[0].update(text="Pick fonts"),
    ],
    ids=["add", "remove", "reorder", "rename"],
)
def test_other_checklist_changes_are_an_edit(change: Any) -> None:
    new = board()
    change(new["cards"]["card-5"]["checklist"])

    assert describe_changes(board(), new) == [
        'Edited card "Design card layout" (checklist)'
    ]


def test_checklist_edit_and_toggle_in_one_save() -> None:
    new = board()
    items = new["cards"]["card-5"]["checklist"]
    items[1]["done"] = True
    items.append({"id": "item-3", "text": "Review", "done": True})

    # A new item that starts done is part of the edit, not a toggle.
    assert describe_changes(board(), new) == [
        'Edited card "Design card layout" (checklist)',
        'Checked off "Set spacing tokens" on "Design card layout"',
    ]


def test_archiving_and_restoring_cards_are_reported() -> None:
    archived = board()
    archived["cards"]["card-1"]["archived"] = True

    assert describe_changes(board(), archived) == ['Archived card "Align roadmap themes"']
    assert describe_changes(archived, board()) == ['Restored card "Align roadmap themes"']


def test_column_changes() -> None:
    new = board()
    new["columns"][0]["title"] = "Ideas"
    new["columns"][2]["wipLimit"] = 5
    new["columns"][3]["wipLimit"] = None
    new["columns"].append({"id": "col-new", "title": "Blocked", "cardIds": [], "wipLimit": None})
    removed = new["columns"].pop(1)
    for card_id in removed["cardIds"]:
        del new["cards"][card_id]
    new["columns"][0], new["columns"][1] = new["columns"][1], new["columns"][0]

    assert describe_changes(board(), new) == [
        'Set the WIP limit of "In Progress" to 5',
        'Renamed column "Backlog" to "Ideas"',
        'Removed the WIP limit from "Review"',
        'Added column "Blocked"',
        'Deleted column "Discovery"',
        "Reordered columns",
        'Deleted card "Prototype analytics view"',
    ]


def test_adding_a_column_alone_is_not_a_reorder() -> None:
    new = board()
    new["columns"].insert(0, {"id": "col-new", "title": "New", "cardIds": [], "wipLimit": None})

    assert describe_changes(board(), new) == ['Added column "New"']


def activity(test_client: TestClient, board_id: str, **params: Any) -> list[dict]:
    response = test_client.get(f"/api/boards/{board_id}/activity", params=params)
    assert response.status_code == 200
    return response.json()


def test_board_activity_is_recorded_newest_first(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)
    assert [entry["message"] for entry in activity(demo_client, board_id)] == [
        'Created board "Product Roadmap"'
    ]
    data = demo_client.get(f"/api/boards/{board_id}").json()
    data["columns"][0]["title"] = "Ideas"
    demo_client.put(f"/api/boards/{board_id}", json=data)
    demo_client.patch(f"/api/boards/{board_id}", json={"name": "Roadmap"})
    demo_client.patch(f"/api/boards/{board_id}", json={"name": "Roadmap"})  # no-op

    entries = activity(demo_client, board_id)

    assert [entry["message"] for entry in entries] == [
        'Renamed board "Product Roadmap" to "Roadmap"',
        'Renamed column "Backlog" to "Ideas"',
        'Created board "Product Roadmap"',
    ]
    assert {entry["source"] for entry in entries} == {"user"}
    assert entries[0]["id"] > entries[1]["id"]
    assert entries[0]["createdAt"] >= entries[1]["createdAt"]


def test_saving_an_unchanged_board_records_nothing(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)
    data = demo_client.get(f"/api/boards/{board_id}").json()

    demo_client.put(f"/api/boards/{board_id}", json=data)

    assert len(activity(demo_client, board_id)) == 1


def test_activity_limit(demo_client: TestClient) -> None:
    board_id = first_board_id(demo_client)
    for name in ["One", "Two", "Three"]:
        demo_client.patch(f"/api/boards/{board_id}", json={"name": name})

    entries = activity(demo_client, board_id, limit=2)

    assert [entry["message"] for entry in entries] == [
        'Renamed board "Two" to "Three"',
        'Renamed board "One" to "Two"',
    ]


@pytest.mark.parametrize("limit", [0, 201, "many"])
def test_activity_limit_is_validated(demo_client: TestClient, limit: Any) -> None:
    board_id = first_board_id(demo_client)
    response = demo_client.get(f"/api/boards/{board_id}/activity", params={"limit": limit})

    assert response.status_code == 422


def test_activity_keeps_only_the_newest_entries(
    demo_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(database, "ACTIVITY_RETENTION", 3)
    board_id = first_board_id(demo_client)
    for index in range(5):
        demo_client.patch(f"/api/boards/{board_id}", json={"name": f"Name {index}"})

    entries = activity(demo_client, board_id, limit=200)

    assert [entry["message"] for entry in entries] == [
        'Renamed board "Name 3" to "Name 4"',
        'Renamed board "Name 2" to "Name 3"',
        'Renamed board "Name 1" to "Name 2"',
    ]


def test_activity_is_private_to_the_board_owner(make_client: ClientFactory) -> None:
    owner = make_client()
    register(owner, username="owner")
    board_id = first_board_id(owner)
    intruder = make_client()
    register(intruder, username="intruder")

    response = intruder.get(f"/api/boards/{board_id}/activity")

    assert response.status_code == 404


def test_activity_requires_a_session(client: TestClient) -> None:
    assert client.get("/api/boards/any/activity").status_code == 401


def test_deleting_a_board_removes_its_activity(demo_client: TestClient) -> None:
    created = demo_client.post("/api/boards", json={"name": "Temp"}).json()
    assert len(activity(demo_client, created["id"])) == 1

    demo_client.delete(f"/api/boards/{created['id']}")

    assert database.list_activity(created["id"], 10) == []

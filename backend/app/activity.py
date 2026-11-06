from typing import Any

# Card fields reported by name when edited.
CARD_FIELD_NAMES = {
    "title": "title",
    "details": "details",
    "priority": "priority",
    "dueDate": "due date",
    "labels": "labels",
}


def _checklist_changes(
    before: list[dict[str, Any]], after: list[dict[str, Any]]
) -> tuple[bool, list[tuple[str, bool]]]:
    """Return whether items were added, removed, renamed, or reordered, and the
    (text, done) of each item whose done state was toggled."""
    done_before = {item["id"]: item["done"] for item in before}
    toggled = [
        (item["text"], item["done"])
        for item in after
        if item["id"] in done_before and done_before[item["id"]] != item["done"]
    ]
    edited = [(item["id"], item["text"]) for item in before] != [
        (item["id"], item["text"]) for item in after
    ]
    return edited, toggled


def _column_of(board: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        card_id: column for column in board["columns"] for card_id in column["cardIds"]
    }


def describe_changes(old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    """Summarize a full-board replacement as human-readable activity messages.

    Reordering cards within a column is not reported; it is frequent and noisy.
    """
    messages: list[str] = []
    old_columns = {column["id"]: column for column in old["columns"]}
    new_columns = {column["id"]: column for column in new["columns"]}

    for column in new["columns"]:
        before = old_columns.get(column["id"])
        if before is None:
            messages.append(f'Added column "{column["title"]}"')
            continue
        if before["title"] != column["title"]:
            messages.append(
                f'Renamed column "{before["title"]}" to "{column["title"]}"'
            )
        if before.get("wipLimit") != column.get("wipLimit"):
            messages.append(
                f'Set the WIP limit of "{column["title"]}" to {column["wipLimit"]}'
                if column.get("wipLimit") is not None
                else f'Removed the WIP limit from "{column["title"]}"'
            )
    for column in old["columns"]:
        if column["id"] not in new_columns:
            messages.append(f'Deleted column "{column["title"]}"')

    kept_order = [cid for cid in old_columns if cid in new_columns]
    if kept_order != [cid for cid in new_columns if cid in old_columns]:
        messages.append("Reordered columns")

    old_column_of = _column_of(old)
    new_column_of = _column_of(new)
    for card_id, card in new["cards"].items():
        column = new_column_of[card_id]
        before = old["cards"].get(card_id)
        if before is None:
            messages.append(f'Created card "{card["title"]}" in "{column["title"]}"')
            continue
        changed = [
            name
            for field, name in CARD_FIELD_NAMES.items()
            if before.get(field) != card.get(field)
        ]
        checklist_edited, toggled = _checklist_changes(
            before.get("checklist", []), card.get("checklist", [])
        )
        if checklist_edited:
            changed.append("checklist")
        if changed:
            messages.append(f'Edited card "{before["title"]}" ({", ".join(changed)})')
        if before.get("archived", False) != card.get("archived", False):
            verb = "Archived" if card["archived"] else "Restored"
            messages.append(f'{verb} card "{card["title"]}"')
        for text, done in toggled:
            verb = "Checked off" if done else "Unchecked"
            messages.append(f'{verb} "{text}" on "{card["title"]}"')
        previous_column = old_column_of[card_id]
        if previous_column["id"] != column["id"]:
            messages.append(
                f'Moved card "{card["title"]}" from "{previous_column["title"]}" '
                f'to "{column["title"]}"'
            )
    for card_id, card in old["cards"].items():
        if card_id not in new["cards"]:
            messages.append(f'Deleted card "{card["title"]}"')

    return messages

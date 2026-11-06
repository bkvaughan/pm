from datetime import date
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, pattern=r"^[A-Za-z0-9_.-]{3,32}$"
    ),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Priority = Literal["low", "medium", "high"]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]


def _dedupe_labels(labels: list[str]) -> list[str]:
    seen: set[str] = set()
    unique = []
    for label in labels:
        if label.lower() not in seen:
            seen.add(label.lower())
            unique.append(label)
    return unique


Labels = Annotated[list[Label], Field(max_length=10), AfterValidator(_dedupe_labels)]
ChecklistText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChecklistItem(StrictModel):
    id: str = Field(min_length=1)
    text: ChecklistText
    done: bool = False


def _unique_item_ids(items: list[ChecklistItem]) -> list[ChecklistItem]:
    if len({item.id for item in items}) != len(items):
        raise ValueError("Checklist item IDs must be unique.")
    return items


Checklist = Annotated[
    list[ChecklistItem], Field(max_length=50), AfterValidator(_unique_item_ids)
]


class BoardCard(StrictModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    details: str
    priority: Priority | None = None
    dueDate: date | None = None
    labels: Labels = []
    checklist: Checklist = []
    archived: bool = False


class BoardColumn(StrictModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    cardIds: list[str]
    wipLimit: int | None = Field(default=None, ge=1, le=99)


class BoardData(StrictModel):
    columns: list[BoardColumn] = Field(min_length=1)
    cards: dict[str, BoardCard]

    @model_validator(mode="after")
    def validate_card_membership(self) -> "BoardData":
        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("Column IDs must be unique.")

        listed_card_ids = [
            card_id for column in self.columns for card_id in column.cardIds
        ]
        if len(listed_card_ids) != len(set(listed_card_ids)):
            raise ValueError("Each card must appear in exactly one column.")
        if set(listed_card_ids) != set(self.cards):
            raise ValueError("Columns must reference every card exactly once.")
        if any(card_id != card.id for card_id, card in self.cards.items()):
            raise ValueError("Card IDs must match their map keys.")
        return self


class User(BaseModel):
    id: str
    username: str
    displayName: str


class RegisterRequest(StrictModel):
    username: Username
    password: Password
    displayName: Name


class LoginRequest(StrictModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True)]
    password: str


class UpdateAccountRequest(StrictModel):
    displayName: Name


class ChangePasswordRequest(StrictModel):
    currentPassword: str
    newPassword: Password


class DeleteAccountRequest(StrictModel):
    password: str


class BoardSummary(BaseModel):
    id: str
    name: str
    cardCount: int
    createdAt: str
    updatedAt: str


class BoardNameRequest(StrictModel):
    name: Name


class ActivityEntry(BaseModel):
    id: int
    source: Literal["user", "assistant"]
    message: str
    createdAt: str

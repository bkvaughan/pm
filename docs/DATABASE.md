# Database proposal

The MVP will use SQLite with four normalized tables: users, boards, board_columns, and cards. The proposed constraints are recorded in [database-schema.json](./database-schema.json).

- Each user can own at most one board (`boards.user_id` is unique); this supports future multiple users while preserving the MVP's one-board-per-user rule.
- Column and card IDs remain text IDs, matching the current frontend model.
- `position` stores column order and card order. The frontend's `cardIds` arrays are represented by the cards' `column_id` and `position`, avoiding duplicated ordering data.
- Cards reference both their board and column, with a composite foreign key ensuring the column belongs to that same board.
- Deleting a user, board, or column cascades to its dependent records.
- Credentials are not stored in this schema; MVP authentication remains the fixed demo login.
- `GET /api/board` reads and `PUT /api/board` replaces the demo user's board using the existing frontend JSON shape. A full-board replacement keeps card creation, deletion, moving, and renaming in one simple, validated write.
- SQLite foreign-key checks are enabled for each backend connection. Docker persists the database in the repository's ignored `data/` directory.

Known limitation: `board_columns.id` and `cards.id` are global primary keys, and the IDs come from the client (`col-backlog`, `card-1`). A second user's board seeded with the same data would fail with a primary key conflict, and card IDs from different boards could collide. Before adding users, make the primary keys `(board_id, id)` on both tables or generate board-scoped IDs. The MVP has one user, so this is not a problem today.

The user approved this schema proposal on 2026-10-21; it is the basis for the backend persistence implementation.

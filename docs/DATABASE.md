# Database

SQLite with six tables: users, sessions, boards, board_columns, cards, and activity. Constraints are recorded in [database-schema.json](./database-schema.json). The schema version is stored in `PRAGMA user_version` (currently 6).

- `users` holds a unique, lowercase `username`, a `display_name`, and a scrypt `password_hash` (`scrypt$<salt hex>$<hash hex>`, stdlib `hashlib.scrypt`).
- `sessions` stores the SHA-256 hash of each session token, never the token itself, with a 30-day `expires_at`. The raw token lives only in the browser's HttpOnly `pm_session` cookie. Expired sessions are rejected and pruned whenever a new session is created. Changing a password deletes the user's other sessions.
- A user owns any number of `boards`, each with a `name`, `created_at`, and `updated_at` (bumped on every save or rename).
- `board_columns` and `cards` use composite primary keys `(board_id, id)`, so column and card IDs only need to be unique within a board. Different boards can reuse IDs such as `col-backlog`.
- Cards store an optional `priority` (`low`, `medium`, `high`), an optional `due_date` (`YYYY-MM-DD`), `labels` as a JSON array of strings (default `[]`), `checklist` as a JSON array of `{id, text, done}` objects (default `[]`), and `archived` (0 or 1, default 0). Archived cards keep their `column_id` and `position` and are not counted in board summaries. Validation lives in the API models.
- Columns store an optional `wip_limit` (1-99), an advisory maximum card count.
- `activity` holds a board's change log: `source` (`user` or `assistant`), a readable `message`, and `created_at`, ordered by its autoincrement `id`. Entries are written in the same transaction as the board change; only the newest 200 per board are kept.
- `position` stores column order and card order. The frontend's `cardIds` arrays are represented by the cards' `column_id` and `position`.
- Cards reference `(board_id, column_id)`, so a card's column always belongs to the same board.
- Deleting a user cascades to sessions and boards; deleting a board or column cascades to its contents. SQLite foreign-key checks are enabled on every connection.
- `PUT /api/boards/{id}` replaces a board's columns and cards in one transaction using the frontend JSON shape.

## Initialization and migration

`initialize_database()` runs at startup. It does nothing if `user_version` is current. A database at version 1 or later is upgraded in place by the scripts in `MIGRATIONS` (version 2 adds the card `priority`, `due_date`, and `labels` columns; version 3 adds `board_columns.wip_limit`; version 4 adds the `activity` table; version 5 adds `cards.checklist`; version 6 adds `cards.archived`). For a new database it creates the schema and seeds the demo user (`user` / `password`) with the "Product Roadmap" sample board. For a version-0 database (the single-board MVP schema), it reads the existing demo board, drops the old tables, creates the new schema, and recreates the demo user with that board, so existing data is kept. Seeding only happens at version 0, so a deleted demo user stays deleted.

Docker persists the database in the repository's ignored `data/` directory.

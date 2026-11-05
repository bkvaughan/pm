# Backend AGENTS.md

## Purpose

This directory contains the FastAPI backend. It serves the static frontend, authenticates users, and persists each user's Kanban boards in SQLite.

## Modules

- app/main.py: routes, session-cookie dependencies (`current_user`, `owned_board`), static serving
- app/models.py: Pydantic request/response models and the `BoardData` contract
- app/security.py: scrypt password hashing and verification
- app/database.py: schema, startup migration and seeding, users, sessions, and boards
- app/activity.py: `describe_changes`, which turns a board replacement into activity messages
- app/assistant.py: OpenRouter client, structured assistant output, and board mutations
- app/initial_data.py: the demo board seeded into a new database

## Stack

- Python 3.12+
- FastAPI
- Uvicorn
- pytest

## Routes

- /: serves the static frontend when its export is available
- /health: service status
- POST /api/auth/register: create a user (with an empty starter board) and sign in; 409 if the username is taken
- POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- PATCH /api/account: change display name
- POST /api/account/password: change password (requires the current password; signs out other sessions)
- POST /api/account/delete: delete the account and its boards (requires the password)
- GET /api/boards, POST /api/boards: list and create the user's boards
- GET /api/boards/{id}, PUT /api/boards/{id}: read and replace a board's columns and cards
- PATCH /api/boards/{id}, DELETE /api/boards/{id}: rename and delete a board
- GET /api/boards/{id}/activity?limit=50: the board's change log, newest first (limit 1-200)
- POST /api/boards/{id}/assistant: ask the AI about a board; returns a reply and optionally a validated, persisted board update

Every route except /, /health, register, login, and logout requires the `pm_session` cookie (401 otherwise). Board routes return 404 for boards the user does not own. Usernames are 3-32 characters (letters, numbers, `.`, `_`, `-`) stored lowercase; passwords need at least 8 characters.

The AI route requires `OPENROUTER_API_KEY` in the backend environment and times out after 30 seconds.
Cards carry `priority` (low/medium/high or null), `dueDate` (ISO date or null), and `labels` (up to 10 unique strings of at most 30 characters). Columns carry an advisory `wipLimit` (1-99 or null). The board assistant accepts explicit card creation, editing (any card field; null clears priority or due date), and movement, plus column renaming and WIP limits. The prompt includes today's date so relative due dates work. Invalid model output or references are rejected without saving changes.

## Development commands

From the repository root:

```bash
uv run --project backend uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
uv run --project backend pytest backend/tests
```

These need `uv` on PATH (install with `pip install uv` or see https://docs.astral.sh/uv/). Without it, an existing `backend/.venv` works: `backend/.venv/bin/pytest backend/tests`.

Dependencies are locked in `backend/uv.lock`, and the Docker build uses `uv sync --frozen`. After changing `pyproject.toml`, run `uv lock --project backend` and commit the lock file.

## Validation

Tests live in `tests/`, with shared fixtures in `conftest.py` (`client`, `demo_client`, and `make_client` for independent sessions in multi-user tests):

- test_auth.py: registration, login, logout, protected routes, session expiry and pruning, password change, account deletion
- test_boards.py: board CRUD, board data validation and persistence, card field defaults and validation, column changes, ID reuse across boards, cross-user isolation
- test_assistant.py: mocked OpenRouter success and error paths, structured output validation, per-board mutations, card field create/edit/clear
- test_activity.py: change descriptions, activity recording, limits, retention, and access control
- test_database.py: new database seeding, idempotent startup, migration from the single-board schema and from each later version (`schema_at` rebuilds old schemas), password hashing

The runtime database is stored in `data/` locally and mounted at `/app/data` in Docker.

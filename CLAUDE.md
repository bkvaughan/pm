# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Project management app: users register and sign in, manage any number of Kanban boards, and use an AI chat sidebar that can create, edit, and move cards and rename columns on the open board. Next.js static frontend served by a Python FastAPI backend, packaged in one Docker container, persisted in SQLite.

Read `AGENTS.md` (requirements, coding standards, colors) and `docs/PLAN.md` (phase-by-phase execution record) before making changes. `frontend/AGENTS.md`, `backend/AGENTS.md`, and `scripts/AGENTS.md` describe each area; keep them accurate when behavior changes.

## Coding standards (from AGENTS.md)

- Keep it simple: no over-engineering, no unnecessary defensive programming, no extra features.
- Keep the README minimal. No emojis, ever.
- Identify the root cause with evidence before fixing an issue; do not guess.
- Use current library versions and idiomatic approaches.
- Planning/working docs live in `docs/`.

## Commands

Full app (Docker, serves on http://localhost:8000; requires `OPENROUTER_API_KEY` in root `.env`):

```bash
scripts/start.sh            # docker compose up --build -d
scripts/stop.sh             # docker compose down
```

Backend (run from repo root; uses `uv`):

```bash
uv run --project backend uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
uv run --project backend pytest backend/tests
uv run --project backend pytest backend/tests/test_app.py::<test_name>
```

Frontend (run from `frontend/`):

```bash
npm run dev                 # next dev on :3000 (no backend; /api calls will fail)
npm run build               # static export to frontend/out/
npm run lint
npm run test:unit           # Vitest (src/**/*.test.ts[x])
npx vitest run src/lib/kanban.test.ts   # single unit test file
npm run test:e2e            # Playwright (tests/), starts next dev on 127.0.0.1:3000
npm run test:e2e:docker     # Playwright smoke test (tests-docker/) against the running Docker app on :8000
```

## Architecture

**Serving model.** The frontend is a Next.js static export (`output: "export"`). FastAPI (`backend/app/main.py`) mounts `frontend/out/` at `/` only if that directory exists at startup, so run `npm run build` before starting uvicorn locally to get the UI. The frontend calls relative `/api/...` URLs and there is no dev proxy, so the integrated app only works when served by FastAPI (locally or in Docker).

**Board data contract.** The shape `{ columns: [{id, title, cardIds, wipLimit}], cards: {id: {id, title, details, priority, dueDate, labels, checklist, archived}} }` is shared across layers: `BoardData` in `frontend/src/lib/kanban.ts` and the Pydantic `BoardData` in `backend/app/models.py` (which validates that every card appears in exactly one column and IDs match map keys). `priority` is `low|medium|high|null`, `dueDate` is `YYYY-MM-DD|null`, and `labels` is up to 10 trimmed, case-insensitively unique strings of at most 30 characters; `checklist` is up to 50 `{id, text, done}` items (text 1-200 characters, IDs unique within the card); `archived` is a boolean; an archived card stays in its column's `cardIds` (so restoring puts it back in place) but is hidden from the board, column counts, WIP limits, filters, and the board list's `cardCount`. These five fields default when omitted. `wipLimit` is `1-99|null` and advisory (the UI flags columns over it; saves are never blocked). Changes to the shape must be made in both places, plus the seed (`initial_data.py`) and its mirror (`src/test/fixtures.ts`).

**Auth.** `POST /api/auth/register|login|logout`, `GET /api/auth/me`. Passwords are scrypt-hashed (`security.py`); sessions are an HttpOnly `pm_session` cookie whose SHA-256 hash is stored in the `sessions` table. `main.py` dependencies `current_user` and `owned_board` guard every account and board route; another user's board returns 404. Account routes: `PATCH /api/account`, `POST /api/account/password`, `POST /api/account/delete`. Docker Compose publishes on `127.0.0.1:8000` only.

**Persistence.** `GET/POST /api/boards` list and create boards; `PATCH/DELETE /api/boards/{id}` rename and delete; `GET /api/boards/{id}` reads and `PUT /api/boards/{id}` replaces a board's columns and cards; there are no per-card endpoints. `backend/app/database.py` maps boards onto SQLite tables (`users`, `sessions`, `boards`, `board_columns`, `cards`; columns and cards keyed by `(board_id, id)`), using `position` columns for ordering. At startup (FastAPI lifespan) it creates the schema, upgrades older schemas via `PRAGMA user_version` (version 0 is the single-board MVP; later steps are in `MIGRATIONS`), and seeds the demo user `user`/`password` with `initial_data.py` only for a new database. DB path is `data/pm.sqlite3` (override with `PM_DATABASE_PATH`); Docker mounts `./data` to `/app/data`. Schema is documented in `docs/DATABASE.md` and `docs/database-schema.json`.

**Activity log.** `save_board` diffs the stored board against the new one with `activity.describe_changes` (pure function in `backend/app/activity.py`) and writes readable messages to the `activity` table in the same transaction, tagged `user` or `assistant`; board create and rename are recorded too. Archiving and restoring are logged as `Archived card` / `Restored card`. Checklist toggles are logged per item (`Checked off "X" on "Card"`); adding, removing, renaming, or reordering items is reported as a `checklist` edit. Card reorders within a column are not logged. Each board keeps its newest 200 entries. `GET /api/boards/{id}/activity?limit=` lists them newest first. The frontend's `BoardSidebar` has Assistant, Activity, and Archived tabs (the Archived tab, `ArchivedCardsPanel`, restores or permanently deletes archived cards; cards on the board can only be archived); the assistant panel stays mounted (`hidden` attribute) so the chat survives tab switches, and `ActivityPanel` refetches when `KanbanBoard` bumps `activityVersion` after a save or assistant update.

**Frontend.** `AppShell.tsx` checks `/api/auth/me`, shows `AuthScreen` when signed out, and switches between `BoardsHome`, `KanbanBoard`, and `AccountSettings`; the open board is kept in `?board=<id>`. All requests go through `src/lib/api.ts`. `KanbanBoard.tsx` (keyed by board ID) filters cards client-side with `matchesFilter` (hidden cards stay in `cardIds` and in saves), applies edits optimistically and serializes full-board PUTs through a promise queue to preserve edit order.

**AI assistant.** `AIChatSidebar.tsx` waits for the board save queue to drain, then posts `{message, history}` to `POST /api/boards/{id}/assistant`; `KanbanBoard` makes the board `inert` until the reply arrives, so edits cannot race the assistant. The backend loads the persisted board, calls OpenRouter (JSON mode) asking for `{reply, mutations[]}`, where mutations are a discriminated union (`create_card`, `edit_card`, `move_card`, `check_item`, `rename_column`, `set_wip_limit`; card mutations accept `priority`, `due_date`, and `labels`, `create_card` also accepts `checklist` item texts, `check_item` marks one checklist item done or not done, and `edit_card` changes only the fields it sends, so `null` clears priority or due date and `archived` archives or restores a card), and `apply_board_mutations` applies them in order; any invalid output or unknown ID returns 502 and nothing is saved. The backend saves valid mutations and returns the updated board, which the frontend displays without sending another `PUT`.

**OpenRouter model.** The configured model is `OPENROUTER_MODEL` in `assistant.py` (`nvidia/nemotron-3.5-super-vl:free`; must be a `:free` model). See the Part 8 record in `docs/PLAN.md` for why it changed from `openai/gpt-oss-120b`. The backend reads `OPENROUTER_API_KEY` from the process environment (Docker Compose loads `.env`; a local uvicorn run needs it exported).

## Testing notes

- Backend tests (`backend/tests/`, fixtures in `conftest.py`: `client`, `demo_client`, `make_client` for multi-user tests) monkeypatch `database.DB_PATH` to a temp file and mock OpenRouter; they never hit the network. If `uv` is not installed, `backend/.venv/bin/pytest backend/tests` works.
- Playwright selectors use the prefixes `card-`, `column-`, and `board-tile-` (`[data-testid^="column-"]`), so other test IDs must not start with them (badge rows use `badges`, `count-badge`, `options-panel`). Locate elements by stable test ID, not by position or visible text, when a step moves them or switches them into edit mode.
- `KanbanCard` registers the card as its own dnd-kit activator node (`setActivatorNodeRef`); without it the keyboard sensor captures Space and Enter pressed on controls inside the card (checkboxes, Edit/Delete buttons) and starts a drag.
- dnd-kit swallows clicks for 50ms after a drop; Playwright tests that click right after a drag must retry (see `tests/workspace.spec.ts`).
- Unit tests stub `fetch` with `src/test/mockFetch.ts` (routes keyed by `"METHOD /path"`). Playwright tests mock the API with the stateful `tests/mockApi.ts` (auth, board list, per-board data) and do not exercise the real backend. `tests-docker/smoke.spec.ts` runs against the real Docker app: a full new-user journey (register, card details and checklist, columns, activity, archive, boards, reload, logout/login, delete account), cross-user isolation, and demo-board drag persistence; each test cleans up its data. Mocked board data comes from `src/test/fixtures.ts`, which mirrors the backend seed.

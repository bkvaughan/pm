# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Project Management MVP: a single-user Kanban board with an AI chat sidebar that can create, edit, and move cards and rename columns. Next.js static frontend served by a Python FastAPI backend, packaged in one Docker container, persisted in SQLite.

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

**Board data contract.** The shape `{ columns: [{id, title, cardIds}], cards: {id: {id, title, details}} }` is shared across layers: `BoardData` in `frontend/src/lib/kanban.ts` and the Pydantic `BoardData` in `main.py` (which validates that every card appears in exactly one column and IDs match map keys). Changes to the shape must be made in both places.

**Network exposure.** Docker Compose publishes the app on `127.0.0.1:8000` only, because the API has no authentication.

**Persistence.** `GET /api/board` reads and `PUT /api/board` replaces the whole board; there are no per-card endpoints. `backend/app/database.py` maps the board onto normalized SQLite tables (`users`, `boards`, `board_columns`, `cards`) using `position` columns for ordering, creates the schema and seeds from `initial_data.py` once at startup (FastAPI lifespan). DB path is `data/pm.sqlite3` (override with `PM_DATABASE_PATH`); Docker mounts `./data` to `/app/data`. Schema is documented in `docs/DATABASE.md` and `docs/database-schema.json`. Everything is scoped to the hardcoded demo user `user`.

**Frontend sync.** `KanbanBoard.tsx` loads the board after login, applies edits optimistically, and serializes full-board PUTs through a promise queue to preserve edit order. Sign-in (`LoginGate.tsx`, `user`/`password`) is client-side in-memory only; the API does not enforce auth.

**AI assistant.** `AIChatSidebar.tsx` waits for the board save queue to drain, then posts `{message, history}` to `POST /api/ai/assistant`; `KanbanBoard` makes the board `inert` until the reply arrives, so edits cannot race the assistant. The backend loads the persisted board, calls OpenRouter (JSON mode) asking for `{reply, mutations[]}`, where mutations are a discriminated union (`create_card`, `edit_card`, `move_card`, `rename_column`), and `apply_board_mutations` applies them in order; any invalid output or unknown ID returns 502 and nothing is saved. The backend saves valid mutations and returns the updated board, which the frontend displays without sending another `PUT`.

**OpenRouter model.** The configured model is `OPENROUTER_MODEL` in `main.py` (`nvidia/nemotron-3.5-super-vl:free`; must be a `:free` model). See the Part 8 record in `docs/PLAN.md` for why it changed from `openai/gpt-oss-120b`. The backend reads `OPENROUTER_API_KEY` from the process environment (Docker Compose loads `.env`; a local uvicorn run needs it exported).

## Testing notes

- Backend tests monkeypatch `database.DB_PATH` to a temp file and mock OpenRouter; they never hit the network.
- Playwright tests mock `/api/board` (stateful) and `/api/ai/assistant` via `page.route`, so they do not exercise the real backend. `tests-docker/smoke.spec.ts` covers sign-in, a card move, and reload against the real Docker app, and restores the board afterward. Mocked board data comes from `src/test/fixtures.ts`, which mirrors the backend seed.

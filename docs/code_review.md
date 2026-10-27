# Code review

Date: 2026-10-27
Scope: whole repository at commit `cd4871b`, plus the uncommitted switch to the `nvidia/nemotron-3.5-super-vl:free` model.
Baseline: all automated checks pass (17 backend tests, 14 frontend unit tests, 10 Playwright tests, lint, static build), and live Docker checks of the board API and the AI assistant succeeded on 2026-10-26.

## Summary

The codebase is small, readable, and close to the "keep it simple" standard in `AGENTS.md`. The backend validates input well, and the AI change path is safe: model output is checked against a strict schema and applied only when every change is valid. The most important problems are:

1. Editing cards in the UI is not implemented, although it is a stated business requirement.
2. An AI request can silently overwrite edits the user makes while waiting 20-40 seconds for the reply.
3. Clearing a column title fails to save, and every keystroke in a column title sends a full-board save.
4. The API has no authentication and Docker publishes it on all network interfaces, so anyone on the local network can change the board and use the OpenRouter key.

Findings are grouped by priority. Each has an ID referenced in the action list at the end.

## High priority

### H1. Cards cannot be edited in the UI (missing requirement)

`AGENTS.md` requires that cards "can be moved with drag and drop, and edited". The UI supports adding (`NewCardForm.tsx`), removing (`KanbanCard.tsx:43`), and moving cards, but there is no way to change a card's title or details. Only the AI assistant can edit cards (`edit_card` mutation in `backend/app/main.py`). No test covers editing because the feature does not exist.

Action: add inline editing of card title and details to `KanbanCard.tsx`, routed through `updateBoard` like the other edits, with a unit test and a Playwright test.

### H2. AI replies overwrite edits made while the request is in flight

`AIChatSidebar.tsx:89` sends the `board` prop as it was when the user pressed Send. The backend applies the mutations to that submitted board and saves it as the whole board (`main.py`, `assist_with_board` then `database.save_board`). The frontend then replaces its state with the returned board (`KanbanBoard.tsx:251`, `updateBoard(() => nextBoard)`).

With the current model taking 20-40 seconds per reply, a user who adds, moves, or deletes a card during that wait loses the change both on screen and in the database, with no warning. Edits still waiting in the frontend save queue when Send is pressed are also at risk.

Action: have the assistant work from the persisted board instead of a client snapshot. The simplest version:
- Before sending, wait for the save queue to drain (`await saveQueue.current`).
- In the backend, load the board with `database.get_board()` instead of accepting `board` in the request, and remove `board` from `AIAssistantRequest`.
- Disable board editing while the assistant is working (simplest), or apply only the returned mutations to the current client board.

### H3. Column rename saves on every keystroke and fails on an empty title

`KanbanColumn.tsx:48` calls `onRename` on every `onChange`, and each call queues a full-board `PUT`. Typing a 12-character title sends 12 sequential saves. Clearing the field to retype it sends `title: ""`, which the backend rejects (`BoardColumn.title` has `min_length=1`, so HTTP 422). The UI shows "Board save failed (422)", the server keeps the old title, and the screen shows an empty column name until the user types again.

Action: keep the input's draft in local state and commit on blur or Enter. Trim the value, and revert to the previous title if it is empty. Add a unit test for the empty-title case.

### H4. Unauthenticated API exposed on all network interfaces

The sign-in is client-side only (`LoginGate.tsx`), which the plan accepts for the MVP. However, `docker-compose.yml` publishes `"8000:8000"`, which binds every host interface, and uvicorn listens on `0.0.0.0`. Anyone on the same network can therefore:
- read and replace the board through `GET/PUT /api/board`;
- send arbitrary prompts through `POST /api/ai/completion`, which is an open proxy for the OpenRouter key. The frontend never calls it; it exists only for the Part 8 connectivity check.

Action:
- Change the port mapping to `"127.0.0.1:8000:8000"` so the app is only reachable from the host. This matches "runs locally".
- Remove `/api/ai/completion` and its tests, or keep it only if the connectivity check is still wanted. The assistant route already proves connectivity.

## Medium priority

### M1. A failed save leaves the screen out of sync with the server

`updateBoard` (`KanbanBoard.tsx:67`) applies edits optimistically. When a `PUT` fails, the error is shown, but the board on screen keeps the unsaved state, there is no retry, and the error clears on the next edit even if that save also only partly helped. A later successful save resends the whole board and recovers, but if the user stops editing or refreshes, the change is silently lost.

Action: on save failure, show a "Reload board" action that calls `loadBoard()`, or retry the latest board once. Keep it to one simple mechanism.

### M2. The schema does not actually support a second user

`docs/DATABASE.md` says the schema supports future users, but `board_columns.id` and `cards.id` are global primary keys and the IDs come from the client (`col-backlog`, `card-1`). Seeding a second user's board with `INITIAL_BOARD` would fail with a primary key conflict. Card IDs from different boards could also collide.

Action: no code change is needed for the MVP. Before adding users, make the primary keys `(board_id, id)` on both tables, or generate board-scoped IDs. Record this limitation in `docs/DATABASE.md` now.

### M3. Assistant replies are slow and the UI gives no expectation

Live replies took 19-42 seconds with the free model. The sidebar only shows "Assistant is thinking...", and `fetch` has no client-side timeout or cancel. `OPENROUTER_TIMEOUT = 30.0` is an httpx per-operation timeout, not a limit on the whole request, so a slow model can take longer than 30 seconds overall. This makes H2 more likely to happen.

Action: show elapsed time or a note that replies can take up to a minute. Optionally add a Cancel button using `AbortController`. Re-evaluate free models periodically: the previous one was removed without notice.

### M4. Python builds are not reproducible

There is no `backend/uv.lock`, so `uv sync --no-dev` in the Dockerfile resolves the latest matching versions at every build. The plan records that `--frozen` was dropped because the lock file was missing. The test run already shows a deprecation warning from a newer Starlette (`Using httpx with starlette.testclient is deprecated`), which is a sign that dependencies drift between builds.

Action: run `uv lock`, commit `backend/uv.lock`, and use `uv sync --frozen --no-dev` in the Dockerfile.

### M5. No test exercises the real frontend and backend together

The Playwright tests run against `next dev` with `/api/board` and `/api/ai/assistant` mocked (`tests/kanban.spec.ts`). Contract mismatches between the frontend and the real FastAPI responses (for example, the 422 in H3) cannot be caught. The live checks recorded in `PLAN.md` are manual.

Action: add one Playwright smoke test that runs against the Docker app on port 8000, covering sign in, load, move a card, reload, and check the card stayed. Keep the existing mocked tests for drag-and-drop detail.

## Low priority

### L1. AI board changes are saved twice

The backend saves the board after applying mutations (`main.py`, `if assistant_output.mutations: database.save_board(...)`). The frontend then calls `updateBoard(() => nextBoard)`, which sends the same board again with `PUT`. This is harmless but redundant.

Action: after H2, choose one owner for the save. The simplest is to keep the backend save and set the board on screen without queueing a `PUT`.

### L2. Redundant client-side validation of the assistant response

`AIChatSidebar.tsx:22-49` hand-validates the `BoardData` shape returned by the backend. The backend already enforces the shape through `response_model=AIAssistantResponse` and `BoardData.model_validate`. This is the kind of defensive code `AGENTS.md` asks to avoid.

Action: remove `isRecord`/`isBoardData`/`isAssistantResponse`, and type the parsed response directly.

### L3. Duplicated error handling in the sidebar

`AIChatSidebar.tsx:99-112` calls `setError(detail); return;` in both the `catch` and the normal path.

Action: replace with a single `const payload = await response.json().catch(() => null)` followed by one `setError`.

### L4. Seed data duplicated between frontend and backend

`initialData` in `frontend/src/lib/kanban.ts` is used only by tests, while the real seed is `backend/app/initial_data.py`. The two must be kept identical by hand.

Action: move `initialData` into a test fixture file (for example `frontend/src/test/fixtures.ts`) so production code does not carry seed data, and note that it mirrors the backend seed.

### L5. Database initialization runs on every request

`get_board` and `save_board` call `initialize_database`, which runs the full `CREATE TABLE IF NOT EXISTS` script and seed check on every board read and write.

Action: call `initialize_database()` once at startup with a FastAPI lifespan handler. Tests can still point `DB_PATH` at a temp file before creating the client.

### L6. Fixed five-column layout is hardcoded in several places

`KanbanBoard.tsx:350` uses `grid-cols-5`, and the header copy says "Five columns". The backend accepts any number of columns through `PUT /api/board`. This is consistent with the "fixed columns" requirement, but nothing enforces it on the server.

Action: either validate the fixed column IDs in `BoardData`, or accept the soft constraint and leave it. Recommended: leave it, since the AI cannot add or remove columns.

### L7. Drag and drop is mouse-only

Only `PointerSensor` is registered (`KanbanBoard.tsx:36`). Cards can receive focus (dnd-kit `attributes`), but they cannot be moved with the keyboard.

Action: add `KeyboardSensor` with `sortableKeyboardCoordinates`. This is a small change.

### L8. Minor layout inconsistency

The logout bar is constrained to `max-w-[1500px]` (`LoginGate.tsx:36`), while the board uses `max-w-[2000px]` (`KanbanBoard.tsx:291`). On wide screens the Log out button does not line up with the board edge.

Action: use the same max width in both places.

### L9. Prompt injection through card content

Card titles and details are sent to the model inside the board JSON. Text in a card could instruct the model to make other changes. The impact is limited to the user's own board, and every change is validated, so this is acceptable for a single-user MVP.

Action: none for the MVP. Revisit if boards become shared.

## Repository and tooling

| ID | Issue | Action |
|---|---|---|
| R1 | `scripts/start.sh` and `stop.sh` are not executable (`-rw-r--r--`), so `./scripts/start.sh` fails. | `chmod +x scripts/*.sh` and commit the mode change. |
| R2 | `frontend/test-results/.last-run.json` is committed, although it is a generated Playwright artifact. | `git rm --cached` it and add `test-results/` to `frontend/.gitignore`. |
| R3 | `AGENTS.md` still names `openai/gpt-oss-120b` as the model. | Update it to say "a free OpenRouter model (`:free`), currently set in `OPENROUTER_MODEL`". |
| R4 | `backend/AGENTS.md` dev commands assume `uv` is on PATH; it is not installed on this machine, and `backend/.venv` was used instead. | Add a note on installing uv, or keep the fallback command `backend/.venv/bin/pytest`. |
| R5 | The Dockerfile copies `backend/tests` into the runtime image. | Remove that `COPY` line; tests are not run in the container. |
| R6 | Test counts in `docs/PLAN.md` validation records (6 backend, 11 unit, 4 E2E) are out of date (now 17, 14, 10). | Optional: note the current counts in the next plan update. |
| R7 | `@types/node` is `^20` while the Docker build uses Node 22. | Bump to `^22`. |
| R8 | Uncommitted changes from 2026-10-26 (model switch, `PLAN.md`, `CLAUDE.md`). | Commit them. |

## What is working well

- Strict Pydantic models with `extra="forbid"` and a board-level validator that guarantees every card is in exactly one column.
- AI output is parsed into a discriminated union and applied all-or-nothing. Invalid or unknown references return 502 without saving.
- OpenRouter errors are mapped to clear, non-leaking messages (missing key, rejected key, timeout, unreachable).
- The serialized save queue in the frontend preserves edit order.
- SQLite foreign keys are enabled per connection, and saves run in a single transaction.
- Tests are focused and readable. The backend tests isolate the database and never hit the network.

## Action plan

Ordered by value for effort. Each item can be done and tested on its own.

| # | Action | Findings | Effort | Status |
|---|---|---|---|---|
| 1 | Bind Docker to `127.0.0.1` and remove `/api/ai/completion`. | H4 | Small | Done 2026-10-27 |
| 2 | Commit column renames on blur/Enter, reject empty titles. | H3 | Small | Done 2026-10-27 |
| 3 | Make the assistant use the persisted board, drain the save queue first, lock editing while waiting, and save in one place. | H2, L1 | Medium | Open |
| 4 | Add inline card editing with tests. | H1 | Medium | Open |
| 5 | Add a reload action after a failed save. | M1 | Small | Open |
| 6 | Commit `uv.lock` and use `--frozen` in the Dockerfile. | M4 | Small | Open |
| 7 | Add one Playwright smoke test against the Docker app. | M5 | Medium | Open |
| 8 | Show expected wait time for assistant replies. | M3 | Small | Open |
| 9 | Repo hygiene: script permissions, ignore test results, update `AGENTS.md`, drop tests from the image, bump `@types/node`, commit pending changes. | R1-R8 | Small | Open |
| 10 | Simplifications: remove client response validation, merge sidebar error handling, move seed data to test fixtures, initialize the DB at startup. | L2-L5 | Small | Open |
| 11 | Add keyboard drag support and align the logout bar width. | L7, L8 | Small | Open |
| 12 | Document the multi-user primary key limitation in `docs/DATABASE.md`. | M2 | Small | Open |

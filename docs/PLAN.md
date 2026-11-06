# Project execution plan

This plan is the execution checklist for the PM MVP. It is intentionally detailed enough that the agent can work through the project in order, keep validation tight, and stop only when each phase has passed the recorded tests and success criteria.

Status: Approved execution plan. Database schema sign-off was recorded on 2026-10-21 before Part 6 work began.

## Project constraints and decisions

- Frontend: Next.js 16 static export, React 19, TypeScript, and Tailwind CSS; FastAPI serves the export at `/`.
- Backend: Python FastAPI in a Docker image, with `uv` managing Python dependencies.
- Database: SQLite created and migrated at startup; Docker persists it in the ignored repository `data/` directory.
- Authentication (Part 11): users register and sign in against the API; passwords are scrypt-hashed; sessions are HttpOnly `pm_session` cookies backed by hashed tokens in SQLite. Every board and account route requires a session. The seeded demo account is `user` / `password`.
- Ownership: each user owns any number of boards; board routes return 404 for boards the user does not own.
- Board API: `GET /api/boards/{id}` retrieves a board and `PUT /api/boards/{id}` validates and replaces it as a whole. Replacement keeps CRUD, movement, and renaming simple and consistent with the frontend shape. Board metadata uses `GET/POST /api/boards` and `PATCH/DELETE /api/boards/{id}`.
- Database model: normalized `users`, `sessions`, `boards`, `board_columns`, and `cards`; column and card IDs are scoped to their board by composite keys, integer positions store ordering, and foreign keys cascade dependent deletes. See `docs/DATABASE.md`.
- Frontend sync: board loads after login; edits are optimistic and full-board saves are serialized through a promise queue to preserve edit order. The UI reports load/save errors, provides retry for load failures, and indicates saving status.
- Frontend test boundary: Playwright tests mock the API (`tests/mockApi.ts`); backend tests and the Docker integration tests (`tests-docker/`) verify real auth, isolation, and SQLite persistence.
- Local scripts: platform-specific start/stop scripts use Docker Compose; the macOS/Linux start script runs Compose detached, and Docker Compose logs can be followed separately.
- AI: configured OpenRouter model is `nvidia/nemotron-3.5-super-vl:free`; key comes from project-root `.env`.
- UI colors: yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, and gray `#888888`.

## Part 1: Plan and documentation setup

Goal: Prepare a clear implementation roadmap, document the current frontend code, and confirm the plan with the user before any build work begins.

Substeps:
- [x] Review the existing workspace structure, project constraints, and current frontend implementation.
- [x] Confirm the business requirements, MVP limits, stack choices, and color system are recorded in the plan.
- [x] Expand the plan into numbered phases with substeps, validation steps, and pass/fail criteria.
- [x] Create a frontend-specific AGENTS.md that explains the current app structure, libraries, test setup, and coding patterns.
- [x] Share the plan with the user for approval before starting any scaffolding work.

Validation:
- [x] Check that the plan includes all numbered phases from 2 through 10.
- [x] Check that every phase lists concrete implementation tasks, a test strategy, and measurable success criteria.
- [x] Check that the frontend AGENTS.md accurately reflects the current code instead of describing aspirational future-state code.

Success criteria:
- [x] The project plan is complete and understandable by a new agent.
- [x] The frontend AGENTS.md describes the actual codebase structure and test flow.
- [x] User approves the plan before implementation continues.

Validation record:
- Reviewed the current repo and frontend component/test structure.
- Plan approval was given before Part 2 implementation.

## Part 2: Scaffolding and local app runtime

Goal: Get a working local app stack running in Docker with a Python FastAPI backend and static frontend serving.

Substeps:
- [x] Create Docker configuration for the app container and any required local ports.
- [x] Create the backend directory structure and initialize FastAPI.
- [x] Add a minimal app route that returns a simple hello-world response.
- [x] Add an API route that can be called from the frontend or curl to verify connectivity.
- [x] Add start/stop scripts for Mac, PC, and Linux under scripts/.
- [x] Confirm the backend serves static HTML from a local route and an API route responds correctly.
- [x] Confirm the app can run locally without breaking the project assumptions.

Tests:
- [x] Curl the root route and confirm static content loads.
- [x] Curl the API route and confirm a valid JSON response is returned.
- [x] Start and stop scripts should execute without errors on the target platform.

Success criteria:
- [x] The app runs locally via Docker and scripts.
- [x] A basic health or hello-world route responds correctly.
- [x] The backend is reachable and the app is not blocked by package or container startup issues.

Validation record:
- Local FastAPI smoke test verified `/`, `/api/hello`, and `/health`.
- Backend tests passed (3 tests).
- Docker startup initially revealed that `--frozen` required a missing `uv.lock`; Dockerfile was corrected to resolve dependencies with `uv sync --no-dev`.
- The app was rebuilt and verified in Docker during later phases.

## Part 3: Frontend integration and static serving

Goal: Make the existing Next.js frontend build and serve from the backend at /, and ensure the demo Kanban board is visible at the root route.

Substeps:
- [x] Review the current Next.js frontend in frontend/ and identify the root page and component structure.
- [x] Update the project so the frontend can be built as static output and served by FastAPI.
- [x] Connect the backend root route to the built frontend output.
- [x] Ensure the Kanban board renders at / without extra client-side workarounds.
- [x] Preserve the current design and make sure the app is functional in the served environment.
- [x] Run unit tests and any frontend integration checks relevant to the static build.

Tests:
- [x] Run frontend unit tests for the board logic and rendering.
- [x] Run the Playwright app smoke test to confirm the page loads at /.
- [x] Verify the app serves the Kanban on the root route, not just a placeholder shell.

Success criteria:
- [x] / serves the existing Kanban demo without runtime error.
- [x] Static build and runtime serve pipeline works.
- [x] Basic page and board rendering passes tests.

Validation record:
- Frontend static build passed.
- FastAPI served `frontend/out/index.html` at `/` and its assets correctly.
- Root page and backend API routes were verified with HTTP requests.
- Docker build and serving were subsequently verified with the integrated sign-in UI.

## Part 4: Fake user sign-in flow

Goal: Add the required sign-in experience before the Kanban is visible.

Substeps:
- [x] Add a simple sign-in screen at the app entry point.
- [x] Require valid credentials: username "user" and password "password".
- [x] Keep the UI minimal and maintain the single-user MVP requirement.
- [x] Show the Kanban only after successful login.
- [x] Add a logout action that returns the user to the sign-in view.
- [x] Ensure the app can handle session state for the signed-in user without overengineering.

Tests:
- [x] Test that unauthenticated access redirects or hides the board.
- [x] Test that valid credentials allow access.
- [x] Test invalid credentials reject access.
- [x] Test logout clears the session and returns to the login screen.

Success criteria:
- [x] A user must authenticate before seeing the board.
- [x] The dummy credentials work exactly as specified.
- [x] Logout behavior is reliable and test-covered.

Validation record:
- `npm run test:unit`: 9 tests passed.
- `npm run test:e2e`: 4 browser tests passed, including invalid credentials, successful sign-in, logout, and existing board flows.
- `npm run lint`: passed.
- `npm run build`: passed; the frontend remains statically exported.

## Part 5: Database modeling and schema proposal

Goal: Define the persistence model for the Kanban board and record it in the repo for review.

Substeps:
- [x] Identify the minimum data model required for users, boards, columns, and cards.
- [x] Design a SQLite-friendly schema that supports future multi-user expansion without overbuilding.
- [x] Save the schema as a JSON file under docs/ or another agreed location.
- [x] Document how the schema maps to the current board, card, and column concepts.
- [x] Get explicit user sign-off before implementing database-backed routes.

Tests:
- [x] Validate the schema JSON is parseable and internally consistent.
- [x] Confirm the schema covers the current MVP requirements without adding unnecessary complexity.
- [x] Confirm the model can support future multiple users yet remains simple for the MVP.

Success criteria:
- [x] Database schema is documented and approved.
- [x] The schema matches the current Kanban data shape and user limitation.
- [x] There is no hidden scope creep beyond the MVP requirements.

Validation record:
- `python3 -m json.tool docs/database-schema.json`: passed.
- Manual review confirmed the one-board-per-user constraint, persisted column/card ordering, and same-board column/card relationship.
- User approved the schema on 2026-10-21.

## Part 6: Backend API and persistence layer

Goal: Implement backend routes that can read and write the Kanban board for a logged-in user, and create the database automatically if absent.

Substeps:
- [x] Add SQLite database initialization and connection setup.
- [x] Create schema migration or startup initialization logic.
- [x] Define routes to fetch the current board for the signed-in user.
- [x] Define routes to update board structure, rename columns, add cards, move cards, and delete cards.
- [x] Ensure the backend handles basic validation of payloads.
- [x] Write backend unit tests for the main board actions.
- [x] Make sure the app works when the database file does not already exist.

Tests:
- [x] Unit tests for board fetch and save actions.
- [x] Unit tests for moving cards and renaming columns.
- [x] Unit tests for initializing an empty database.
- [x] Validate error handling for malformed requests.

Success criteria:
- [x] The backend reliably stores and retrieves board state.
- [x] Database creation is automatic.
- [x] Core board operations are covered by tests and pass reliably.

Validation record:
- Backend tests: 6 passed, covering API smoke routes, automatic DB creation and seed, renaming, add/move/delete board updates, persistence, and malformed board rejection.
- Python compile check: passed.
- Docker rebuild passed; root sign-in page, `/health`, `/api/hello`, and board GET/PUT/GET persistence verified against the running container.

## Part 7: Frontend-to-backend integration

Goal: Replace the local-only state with persistent API-backed board state.

Substeps:
- [x] Update the frontend to fetch board state from the backend after login.
- [x] Update create, move, rename, and delete actions to call backend endpoints.
- [x] Handle loading and error UI behavior cleanly.
- [x] Keep the current board UX while moving from local memory to server-backed state.
- [x] Run thorough validation of the full user flow across both layers.

Tests:
- [x] Frontend tests for successful fetch and update flows.
- [x] Integration tests covering add, move, rename, and delete operations using the API.
- [x] Error-path tests for failed API calls or unavailable backend responses.

Success criteria:
- [x] The Kanban is persisted and remains correct after refresh.
- [x] The frontend and backend integrate without race conditions or broken board state.
- [x] The user experience remains simple and stable.

Validation record:
- Frontend unit tests: 11 passed, including board load/update, saved state, retry, and surfaced save errors.
- Playwright E2E tests: 4 passed, including moving a card, saving it, logging out, and verifying it remains in the moved column after login. The browser tests use a stateful mock of `/api/board`.
- Frontend lint and static production build passed.
- Docker rebuild and live root/health smoke tests passed.
- Live API persistence check moved a card between columns, confirmed GET returned the moved state, and restored the original local board afterward. This directly verified the actual SQLite-backed API.

## Part 8: AI connectivity via OpenRouter

Goal: Confirm the backend can successfully call OpenRouter and return valid AI results.

Substeps:
- [x] Add environment handling for the OpenRouter API key.
- [x] Configure the backend to call a free model (currently nvidia/nemotron-3.5-super-vl:free).
- [x] Run a minimal AI connectivity test with a trivial prompt such as "2+2".
- [x] Validate request/response handling, timeout, and error surfaces.
- [x] Confirm the backend logs or exposes enough detail to debug AI issues without overengineering.

Tests:
- [x] A simple backend test using the AI endpoint with a trivial prompt.
- [x] Smoke verification that OpenRouter returns an answer successfully.
- [x] Negative test for missing or invalid API key handling.

Success criteria:
- [x] AI connectivity is confirmed in the backend environment.
- [x] The backend can call OpenRouter reliably with minimal setup.
- [x] The trivial prompt test passes consistently.

Validation record:
- Backend tests mock OpenRouter to verify the `2+2` request, agreed model, response parsing, missing and rejected API keys, and timeout handling.
- The original live `2+2` smoke test used paid model `openai/gpt-oss-120b` and received HTTP 402 because the account had no credits. `google/gemma-4-31b-it:free` also returned HTTP 429 due to its upstream shared pool being rate-limited. `minimax/minimax-m3.1-flash:free` returned HTTP 200 with answer `4` and was configured.
- On 2026-10-26 `minimax/minimax-m3.1-flash:free` was removed from OpenRouter (HTTP 404). Free models supporting JSON response format were tested live through `/api/ai/completion` and `/api/ai/assistant`; Gemma 4 and Xing 4.0 returned HTTP 429 and `nvidia/nemotron-3-super-120b-a12b:free` returned HTTP 404. `nvidia/nemotron-3.5-super-vl:free` answered `4` and applied a requested move and card creation correctly in 3 of 3 runs; it is now the configured model.

## Part 9: Structured AI board assistant

Goal: Let the AI receive the Kanban JSON plus the user question and conversation context, then respond with structured output that includes both a user-facing answer and optional board updates.

Substeps:
- [x] Define the request payload format: board JSON, user message, and conversation history.
- [x] Define the response contract with a text reply and optional board mutation instructions.
- [x] Add backend validation to ensure structured output conforms to the expected shape.
- [x] Implement the board update logic for safe, explicit card/column changes.
- [x] Add tests covering normal AI responses and optional board modifications.
- [x] Confirm the AI can answer a question without changing the board as well as update the board when asked.

Tests:
- [x] Unit tests for valid structured AI responses.
- [x] Unit tests for invalid or partially missing AI payloads.
- [x] Integration tests that send the board JSON and a question, then verify the AI response and update action.

Success criteria:
- [x] The AI receives actionable board context and returns structured data.
- [x] The assistant can answer questions and optionally mutate the Kanban safely.
- [x] Board updates are deterministic and validated before applying.

Validation record:
- Backend tests cover conversation and board context, no-mutation replies, valid create/edit/move/rename operations with persistence, malformed or incomplete structured output, and unknown board references.
- Structured output uses a strict JSON contract; mutations are applied in order and saved only after validation succeeds.

## Part 10: AI chat sidebar and auto-refresh UX

Goal: Add the final user-facing AI chat experience, allow the AI to mutate the board, and refresh the UI automatically when changes occur.

Substeps:
- [x] Add a sidebar chat widget to the frontend layout.
- [x] Support sending chat messages and displaying AI responses.
- [x] Connect the frontend to the AI-backed backend route.
- [x] Add client-side handling for board updates returned by the AI.
- [x] Refresh the board immediately after a valid AI mutation is applied.
- [x] Ensure the UI remains simple and polished without excessive complexity.
- [x] Validate the full happy path: ask, receive answer, update board, show changed board state.

Tests:
- [x] Unit tests for sidebar rendering and chat message flow.
- [x] Integration tests for AI-driven board updates.
- [x] End-to-end tests that verify the board refreshes automatically after an AI update.

Success criteria:
- [x] Users can chat with the AI in a sidebar.
- [x] AI updates to the board are applied automatically and visible immediately.
- [x] The final app meets the MVP business requirement for AI-assisted project management.

Validation record:
- AI chat unit tests cover request payload/history, reply rendering, board-update callbacks, and surfaced backend errors.
- Playwright verifies a requested card move is sent with board context, displayed in the board immediately, and persisted through the existing board API.
- Frontend unit and browser tests, lint, and static production build passed.

## Execution note

The agent should proceed in order, completing the tests for each phase before moving on to the next. The user should approve this plan before any implementation work in Part 2 begins.

## Code review follow-up (2026-11-02)

The action plan in `docs/code_review.md` is complete. Added inline card editing, a Reload board action after a failed save, keyboard drag and drop, a wait-time note in the assistant sidebar, a locked `backend/uv.lock` with `uv sync --frozen` in Docker, a Playwright smoke test against the Docker app (`npm run test:e2e:docker`), database initialization at startup, and repository cleanups.

Validation record: 17 backend tests, 20 frontend unit tests, 12 mocked Playwright tests, and 1 Docker smoke test passed, along with lint and the static build.

## Part 11: User management and multiple boards (2026-11-05)

Goal: Turn the single-board demo into a multi-user app where each user manages several boards.

Completed:
- [x] Real accounts: registration, sign-in, sign-out, and session restore on reload (HttpOnly cookie sessions, scrypt password hashes, hashed session tokens, 30-day expiry with pruning).
- [x] Account settings: change display name, change password (signs out other sessions), delete account (password confirmation, cascades to boards).
- [x] Multiple boards per user: list with card counts and last-updated dates, create, rename, delete with inline confirmation, and open; the open board is kept in the `?board=` URL parameter.
- [x] Per-board ownership checks on every board route, including the AI assistant (`POST /api/boards/{id}/assistant`).
- [x] Columns can be added and deleted (with inline confirmation; the last column cannot be deleted). The board layout fits any number of columns.
- [x] Composite `(board_id, id)` keys for columns and cards, fixing the cross-board ID collision noted in the earlier schema.
- [x] Startup migration from the single-board schema that keeps the existing demo board (verified against the real `data/pm.sqlite3`).
- [x] Backend split into `models.py`, `security.py`, `assistant.py`, `database.py`, and `main.py`.

Validation record: 72 backend tests (auth, boards, isolation, validation, assistant, migration), 46 frontend unit tests (about 90% statement coverage), 16 mocked Playwright tests, and 3 Docker integration tests (full new-user journey, cross-user isolation over HTTP, demo-board drag persistence) passed, along with lint and the static build.

## Part 12: Card details (2026-11-05)

Goal: Give cards the details a project tracker needs.

Completed:
- [x] Cards have an optional priority (low, medium, high), an optional due date, and up to 10 labels; the fields default when omitted, and labels are trimmed and deduplicated case-insensitively.
- [x] Schema version 2 adds the card columns; `MIGRATIONS` upgrades a version-1 database in place (verified against the real `data/pm.sqlite3`).
- [x] The card editor sets priority, due date, and comma-separated labels; cards and the drag preview show badges, with overdue and due-today states.
- [x] The AI assistant can set card details on create and edit, and clear priority or due date with null; the prompt includes today's date.
- [x] The demo seed has priorities and labels.

Validation record: 89 backend tests, 57 frontend unit tests, 17 mocked Playwright tests, and 3 Docker integration tests (the new-user journey now saves card details and checks them after a reload) passed, along with lint, a clean `tsc`, and the static build.

## Part 13: Search and filters (2026-11-05)

Goal: Find cards quickly on busy boards.

Completed:
- [x] A filter bar searches titles, details, and labels and filters by priority, label (from the board's labels), and due date (overdue, today, next 7 days, no due date), with a match count and Clear filters.
- [x] Filtering is client-side and only hides cards: hidden cards keep their positions and are included in saves; columns show `visible/total` counts and "No matching cards"; column delete confirmations count hidden cards.
- [x] Visible cards can still be dragged while filtered.

Validation record: 89 backend tests, 80 frontend unit tests, 18 mocked Playwright tests (repeated 5 times with no failures), and 3 Docker integration tests passed, along with lint, `tsc`, and the static build. Root cause found for a click lost after a drag in the new e2e test: dnd-kit's 50ms post-drop click suppression (test retries the click). The keyboard drag test that failed once in 85 runs in Part 12 did not reproduce in 180 further runs.

## Part 14: Column management (2026-11-05)

Goal: Let teams shape their workflow columns.

Completed:
- [x] A column options panel moves a column left or right (buttons rather than drag and drop, which keeps it accessible and avoids nesting a second sortable context around the card drag-and-drop).
- [x] Per-column WIP limits (1-99, blank for none): the count badge shows `cards/limit` and turns red over the limit. Limits are advisory and never block a move.
- [x] Schema version 3 adds `board_columns.wip_limit`; verified upgrading the real `data/pm.sqlite3` from version 2.
- [x] The AI assistant can set or clear WIP limits (`set_wip_limit`) and is told to mention when a change exceeds one.
- [x] The Docker playwright config sets a 10s action timeout so a stuck step fails fast and test cleanup always runs.
- [x] Fixed a layout regression from Part 11: a 220px column minimum plus the end-of-row Add column slot made the default board 1408px wide in a 940px container at 1280px, so it scrolled horizontally. Besides the extra scrolling, dnd-kit auto-scrolled the board mid-drag, so drops intermittently landed in the wrong column (evidence: "moves a card between columns" failed 3 in 15 runs, with the card dropped over a Done card). Add column moved to the toolbar and the column minimum is 170px; a Playwright test now asserts no overflow at 1280px. The drag test then passed 30 of 30 and the full suite 100 of 100. The intermittent keyboard drag failure in Part 12 began with the same layout change and was most likely the same cause.

Validation record: 102 backend tests, 93 frontend unit tests, 20 mocked Playwright tests (300 further full-suite runs after the layout fix had one failure, a drag-highlight `toHaveClass` assertion in a run right after a Docker image build; not reproduced since, cause unknown), and 3 Docker integration tests (the journey now reorders a column, sets a WIP limit, and checks both after a reload) passed, along with lint, `tsc`, and the static build.

## Part 15: Activity log (2026-11-05)

Goal: Show what changed on a board, and who (user or assistant) changed it.

Completed:
- [x] `describe_changes` turns each full-board save into readable messages (cards created, edited with the changed fields, moved, deleted; columns added, renamed, deleted, reordered; WIP limits set or removed). Reorders within a column are not logged.
- [x] Schema version 4 adds the `activity` table; entries are written in the save transaction, tagged `user` or `assistant`, and pruned to the newest 200 per board. Board create and rename are logged.
- [x] `GET /api/boards/{id}/activity` (owner only, `limit` 1-200).
- [x] The sidebar has Assistant and Activity tabs; the activity list refreshes after saves and keeps the chat intact across tab switches.

Validation record: 119 backend tests, 102 frontend unit tests (about 93% statement coverage), 21 mocked Playwright tests (repeated 3 times with no failures), and 3 Docker integration tests (the journey now checks the exact activity messages recorded by the real backend) passed, along with lint, `tsc`, and the static build. The demo-board drag test leaves two activity entries (the move and its restore), which are real history.

## Part 16: Card checklists (2026-11-06)

Goal: Break a card into subtasks and show progress at a glance.

Completed:
- [x] Cards carry a `checklist` of up to 50 `{id, text, done}` items (text trimmed, 1-200 characters, IDs unique within the card). Schema version 5 adds `cards.checklist` (JSON); verified upgrading the real `data/pm.sqlite3` from version 4 with all 10 cards kept.
- [x] Cards show `Checklist done/total` and their items, which can be checked off directly; the card editor adds (Enter), renames, checks, and removes items, and drops blank ones on save.
- [x] The activity log reports each toggle (`Checked off "X" on "Card"`, `Unchecked ...`) and other checklist changes as a `checklist` edit.
- [x] The AI assistant can create cards with checklist items and check items off (`check_item`); unknown cards or items return 502 with nothing saved.
- [x] Fixed a keyboard accessibility bug found while testing: Space on a checklist checkbox started a card drag instead of toggling it. Root cause (dnd-kit 6.3.1 `KeyboardSensor` activator): it ignores keys from nested elements only when an activator node is registered, and the card never registered one, so Space and Enter on any control inside a card were `preventDefault`ed. The same bug stopped Enter on a card's Edit button from opening the editor (new Playwright test fails without the fix and passes with it). `KanbanCard` now registers the card as its activator node.
- [x] Coverage is measured over `src/` only; the report had started counting Next.js build chunks and config files.

Validation record: 138 backend tests, 107 frontend unit tests (92% statement coverage over `src/`), 23 mocked Playwright tests, and 3 Docker integration tests (the journey now adds a checklist item, checks it off from the card, and checks the activity messages) passed, along with lint, `tsc`, and the static build.

## Part 17: Archiving cards (2026-11-06)

Goal: Make removing a card reversible.

Completed:
- [x] Cards carry `archived`. An archived card keeps its place in its column's `cardIds` and is hidden from the board, column counts, WIP limits, filters, and the board list's card count. Schema version 6 adds `cards.archived`; verified upgrading the real `data/pm.sqlite3` from version 5 with all 10 cards kept.
- [x] A card's Delete button became Archive. The sidebar's new Archived tab (labeled with the count) restores cards to their place or deletes them permanently after a confirmation.
- [x] The activity log records `Archived card` and `Restored card`; the assistant can archive and restore through `edit_card`, and is told archived cards are hidden and do not count toward WIP limits.
- [x] Fixed column titles cut to a few letters at 1280px ("Bacl", "Disc", "In"), a regression from the 170px columns in Part 14 found in a screenshot: Delete column moved into the options panel and the decorative dot was removed, so the header holds only the title, count, and options button. The 1280px layout test now also asserts no seeded title is clipped.
- [x] ESLint ignores generated test reports (`coverage/`, `playwright-report/`, `test-results/`).

Validation record: 143 backend tests, 108 frontend unit tests, 24 mocked Playwright tests (one unexplained failure of the keyboard drag test in one full run, error not captured; 15 isolated repeats and 120 tests across 5 full-suite repeats then passed), and 3 Docker integration tests (the journey now archives a card and checks it is hidden, listed in the Archived tab, logged, and not counted) passed, along with lint, `tsc`, and the static build.

## Roadmap for later iterations

Each item ships with backend tests, unit tests, and Playwright coverage, plus Docker integration coverage where it touches persistence.

1. Done in Part 12.
2. Done in Part 13.
3. Done in Part 14.
4. Done in Part 15.
5. Card checklists: done in Part 16.
6. Archiving cards: done in Part 17.

Next candidates: card comments and exporting a board as JSON.

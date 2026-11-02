# Project execution plan

This plan is the execution checklist for the PM MVP. It is intentionally detailed enough that the agent can work through the project in order, keep validation tight, and stop only when each phase has passed the recorded tests and success criteria.

Status: Approved execution plan. Database schema sign-off was recorded on 2026-10-21 before Part 6 work began.

## Project constraints and decisions

- Frontend: Next.js 16 static export, React 19, TypeScript, and Tailwind CSS; FastAPI serves the export at `/`.
- Backend: Python FastAPI in a Docker image, with `uv` managing Python dependencies.
- Database: SQLite created automatically on board access; Docker persists it in the ignored repository `data/` directory.
- MVP sign-in: client-side in-memory demo gate with username `user` and password `password`; refresh requires signing in again. No credentials are stored in the database, and authentication is not yet enforced by the API.
- Ownership: the backend currently addresses the single demo user (`user`); schema supports future users, each with one board.
- Board API: `GET /api/board` retrieves the current board and `PUT /api/board` validates and replaces the board as a whole. Replacement keeps CRUD, movement, and renaming simple and consistent with the current frontend shape.
- Database model: normalized `users`, `boards`, `board_columns`, and `cards`; text IDs align with the frontend, integer positions store column/card ordering, foreign keys cascade dependent deletes, and a composite card-to-column key prevents cross-board references.
- Frontend sync: board loads after login; edits are optimistic and full-board saves are serialized through a promise queue to preserve edit order. The UI reports load/save errors, provides retry for load failures, and indicates saving status.
- Frontend test boundary: Playwright board-flow tests mock `/api/board`; separate backend tests and a live Docker HTTP smoke check verify actual SQLite persistence.
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

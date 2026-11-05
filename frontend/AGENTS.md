# Frontend AGENTS.md

## Purpose

This directory contains the Next.js frontend for the PM MVP. It is the current demo Kanban client that uses React, TypeScript, and the dnd-kit drag-and-drop library. This app is a frontend-only prototype at the moment; the later implementation phases will connect it to the FastAPI backend and AI chat flow.

## Stack and runtime

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- @dnd-kit/core and @dnd-kit/sortable for drag-and-drop
- Vitest + Testing Library for unit tests
- Playwright for browser-based integration tests

## Project structure

- src/app/page.tsx: app entry point that renders the main board
- src/components/LoginGate.tsx: fake username/password gate and logout action
- src/components/KanbanBoard.tsx: board API loading, state, persistence queue, drag/drop orchestration, and responsive board/chat layout
- src/components/AIChatSidebar.tsx: assistant conversation UI, request history, and AI board updates
- src/components/KanbanColumn.tsx: column UI and droppable area
- src/components/KanbanCard.tsx: card rendering, inline editing, and sortable behavior
- src/components/NewCardForm.tsx: inline card-creation form
- src/components/KanbanCardPreview.tsx: drag overlay preview card
- src/components/icons.tsx: inline SVG icons (edit, delete, add, send, log out)
- src/lib/kanban.ts: board data model, moveCard logic, and ID generator
- src/test/setup.ts: Vitest setup for DOM matchers and shared test configuration
- src/test/fixtures.ts: test board data mirroring the backend seed (`backend/app/initial_data.py`)

## Current behavior

The current frontend is a single-page Kanban board demo:

- Sign-in is required before displaying the board. The MVP credentials are username `user` and password `password`.
- Authentication is client-side, in-memory demo state; refreshing returns to the sign-in screen.
- There are five default columns: Backlog, Discovery, In Progress, Review, and Done.
- Each column shows cards and allows the user to rename the column title.
- Cards can be dragged between columns and reorder within a column, with the mouse or the keyboard (Space to pick up, arrow keys to move, Space to drop).
- Users can add a card via a small form inside each column.
- Users can edit a card's title and details inline, and remove a card from the current column, using icon buttons that appear on card hover or focus (always visible on touch devices).
- The board loads from `GET /api/board` and saves changes to `PUT /api/board`.
- Edits are optimistic in the UI and queued in order. Load errors show a Retry button; save errors show a Reload board button that refetches the saved board.
- The AI sidebar waits for pending board saves, then sends the user message and recent conversation to `POST /api/ai/assistant`; the backend reads the saved board itself.
- The board is locked (`inert`) while the assistant works, and the sidebar notes that replies can take up to a minute. Returned board changes are already saved by the backend and are displayed without another save.
- On screens 1280px and wider the app fills the viewport: a slim top bar, the five columns sharing the board width (scrolling horizontally only if needed), and the assistant sidebar beside the board. On smaller screens the sidebar moves below the board.

## Core data model

The board state is represented by the BoardData type in src/lib/kanban.ts:

- columns: list of Column objects
- cards: record of card ID to Card object
- each Column has an id, title, and cardIds array
- each Card has an id, title, and details

The moveCard helper is the main logic for drag-and-drop behavior. It handles:

- moving cards within the same column
- moving cards to another column
- inserting cards at the end of a target column
- preserving valid column state

## Testing setup

The frontend uses two different test layers:

1. Unit tests for board logic and component behavior
   - src/lib/kanban.test.ts checks moveCard behavior
   - src/components/KanbanBoard.test.tsx checks API loading, renaming, adding/editing/removing cards, persistence, and error recovery
   - src/components/AIChatSidebar.test.tsx checks chat messages, history, board updates, and request errors

2. Browser integration tests
   - tests/kanban.spec.ts checks sign-in, board edits, mouse and keyboard drag/drop, and the AI chat board-update flow against mocked APIs

3. Docker smoke test
   - tests-docker/smoke.spec.ts runs against the Docker app on port 8000 (`npm run test:e2e:docker` after `scripts/start.sh`), moves a card, reloads, checks it persisted, and restores the board

## Rules for future changes

- Keep the architecture simple and consistent with the current structure.
- Prefer small, focused component changes over broad rewrites.
- Do not add database logic or AI logic directly into the UI unless the corresponding backend phase is in progress.
- Preserve the existing board model and test style while making changes for auth, backend integration, and AI chat.
- When changing board logic, update or add tests in the same area before considering the feature complete.

## Typical development commands

From this directory:

```bash
npm install
npm run dev
npm run test
npm run test:unit
npm run test:e2e
npm run test:e2e:docker
```

## Working assumptions for upcoming phases

- The current app is a prototype and will evolve into a backend-backed, authenticated Kanban app.
- The board should stay recognizable while the architecture shifts from local state to persisted server state.
- The user sign-in flow, database persistence, and AI chat functionality should be added in later phases without breaking the underlying board model.

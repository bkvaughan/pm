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
- src/components/AIChatSidebar.tsx: assistant conversation UI, request history, and validated AI board updates
- src/components/KanbanColumn.tsx: column UI and droppable area
- src/components/KanbanCard.tsx: card rendering and sortable behavior
- src/components/NewCardForm.tsx: inline card-creation form
- src/components/KanbanCardPreview.tsx: drag overlay preview card
- src/lib/kanban.ts: board data model, initial seed data, moveCard logic, and ID generator
- src/test/setup.ts: Vitest setup for DOM matchers and shared test configuration

## Current behavior

The current frontend is a single-page Kanban board demo:

- Sign-in is required before displaying the board. The MVP credentials are username `user` and password `password`.
- Authentication is client-side, in-memory demo state; refreshing returns to the sign-in screen.
- There are five default columns: Backlog, Discovery, In Progress, Review, and Done.
- Each column shows cards and allows the user to rename the column title.
- Cards can be dragged between columns and reorder within a column.
- Users can add a card via a small form inside each column.
- Users can remove a card from the current column.
- The board loads from `GET /api/board` and saves changes to `PUT /api/board`.
- Edits are optimistic in the UI and queued in order; load and save errors are shown with retry for load failures.
- The AI sidebar sends the current board, user message, and recent conversation to `POST /api/ai/assistant`.
- Assistant replies appear in the conversation; returned board changes update the board immediately and use the normal serialized save queue.
- The sidebar moves below the board on smaller screens and sits beside it on wide screens.

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
   - src/components/KanbanBoard.test.tsx checks API loading, renaming, adding/removing, persistence, and error recovery
   - src/components/AIChatSidebar.test.tsx checks chat messages, history, board updates, and request errors

2. Browser integration tests
   - tests/kanban.spec.ts checks sign-in, board edits and drag/drop, and the AI chat board-update flow

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
```

## Working assumptions for upcoming phases

- The current app is a prototype and will evolve into a backend-backed, authenticated Kanban app.
- The board should stay recognizable while the architecture shifts from local state to persisted server state.
- The user sign-in flow, database persistence, and AI chat functionality should be added in later phases without breaking the underlying board model.

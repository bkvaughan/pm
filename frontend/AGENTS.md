# Frontend AGENTS.md

## Purpose

This directory contains the Next.js frontend: sign-in and registration, the boards home page, the Kanban board with drag and drop, account settings, and the AI chat sidebar. It is a static export served by the FastAPI backend.

## Stack and runtime

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- @dnd-kit/core and @dnd-kit/sortable for drag-and-drop
- Vitest + Testing Library for unit tests
- Playwright for browser-based integration tests

## Project structure

- src/app/page.tsx: app entry point that renders AppShell
- src/components/AppShell.tsx: session check, top bar, and navigation between boards home, a board, and account settings; keeps the open board in `?board=<id>`
- src/components/AuthScreen.tsx: sign-in and create-account forms
- src/components/BoardsHome.tsx: board list with create, rename, delete (inline confirmation), and open
- src/components/AccountSettings.tsx: display name, password change, and account deletion
- src/components/Field.tsx: labelled form input shared by the auth and account forms
- src/components/KanbanBoard.tsx: board loading by ID, state, persistence queue, drag/drop orchestration, column add/delete, and responsive board/chat layout
- src/components/BoardSidebar.tsx: Assistant, Activity, and Archived tabs beside the board
- src/components/ArchivedCardsPanel.tsx: archived cards with Restore and permanent Delete (inline confirmation)
- src/components/ActivityPanel.tsx: the board's recent changes with relative times and an Assistant badge
- src/components/AIChatSidebar.tsx: assistant conversation UI, request history, and AI board updates
- src/components/KanbanColumn.tsx: column UI, rename, options panel (move left/right, WIP limit, delete with inline confirmation), count badge, and droppable area
- src/components/AddColumnForm.tsx: toolbar button and inline form that appends a column
- src/components/KanbanCard.tsx: card rendering, inline editing (title, details, priority, due date, labels, checklist), and sortable behavior
- src/components/CardChecklist.tsx: checklist progress and checkboxes on the card, and the checklist editor in the card form
- src/components/BoardFilters.tsx: search box and priority, label, and due-date filters with a match count and Clear filters
- src/components/CardMeta.tsx: priority, due date (overdue/today/upcoming), and label badges
- src/components/NewCardForm.tsx: inline card-creation form
- src/components/KanbanCardPreview.tsx: drag overlay preview card
- src/components/icons.tsx: inline SVG icons
- src/lib/api.ts: typed API client; every request goes through `request`, which raises `ApiError` with the server's message
- src/lib/kanban.ts: board data model, moveCard logic, ID generator, label parsing, due-date helpers, column moves and WIP limit parsing, and card filtering (`matchesFilter`, `boardLabels`)
- src/test/setup.ts: Vitest setup for DOM matchers
- src/test/fixtures.ts: test board data mirroring the backend seed (`backend/app/initial_data.py`)
- src/test/mockFetch.ts: unit-test fetch stub with handlers keyed by `"METHOD /path"`

## Current behavior

- Signed-out users see the sign-in form and can switch to creating an account. The seeded demo account is `user` / `password`.
- Sessions are HttpOnly cookies set by the backend, so a reload keeps the user signed in and reopens the board in the URL.
- After sign-in the boards home lists the user's boards with card counts and last-updated dates. Users can create (which opens the new board), rename, delete (after an inline confirmation), and open boards.
- The top bar shows the open board's name, a Boards link, the user's display name (opens account settings), and Log out.
- Account settings change the display name, change the password, and delete the account after password confirmation.
- Each column can be renamed, and deleted from its options panel after an inline confirmation that names how many cards (archived ones included) will be removed; the last column cannot be deleted. Columns are added with the Add column button in the board toolbar. A column's options button opens Move left / Move right, a WIP limit, and Delete column; the header keeps only the title, count, and options button so titles fit. The WIP limit is 1-99 (blank for none); the count badge shows `cards/limit` and turns red when a column is over its limit. Columns share the board width (at least 170px each, so five fit at 1280px), scrolling horizontally only when there are more.
- Cards can be dragged between columns and reordered, with the mouse or the keyboard (Space to pick up, arrow keys to move, Space to drop). Cards can be added and edited inline. A card's Archive button hides it from the board (it keeps its place in its column, and is left out of counts, WIP limits, and filters); the sidebar's Archived tab, labeled with the count, restores archived cards or deletes them permanently after a confirmation. The edit form sets a priority, a due date, and comma-separated labels; cards show badges for them, with overdue dates in red and dates due today in amber (based on the browser's local date). The edit form also adds, renames, checks, and removes checklist items (Enter adds an item; blank items are dropped on save). Cards with a checklist show `Checklist done/total` and their items, which can be checked off directly (mouse or Space) without opening the editor.
- The filter bar above the board searches card titles, details, and labels, and filters by priority, label, and due date (overdue, today, next 7 days, none). Filters are combined, are not saved, and only hide cards: hidden cards stay in their columns, saves include them, and column counts show `visible/total`. Visible cards can still be dragged.
- Edits are optimistic in the UI and full-board saves are queued in order. Load errors show a Retry button; save errors show a Reload board button that refetches the saved board.
- The AI sidebar waits for pending board saves, then sends the message and recent conversation to `POST /api/boards/{id}/assistant`. The board is locked (`inert`) while the assistant works. Returned board changes are already saved by the backend and are displayed without another save.
- The sidebar's Activity tab lists the board's recent changes (from the backend), marking those made by the assistant, and refreshes after each save. Switching tabs keeps the assistant conversation and draft.
- On screens 1280px and wider the board view fills the viewport with the assistant sidebar beside the board; on smaller screens the sidebar moves below the board.

## Core data model

The board state is represented by the BoardData type in src/lib/kanban.ts:

- columns: list of Column objects
- cards: record of card ID to Card object
- each Column has an id, title, cardIds array, and wipLimit (number or null)
- each Card has an id, title, details, priority (low/medium/high or null), dueDate (YYYY-MM-DD or null), labels, and checklist ({id, text, done} items)

The moveCard helper is the main logic for drag-and-drop behavior. It handles:

- moving cards within the same column
- moving cards to another column
- inserting cards at the end of a target column
- preserving valid column state

## Testing setup

1. Unit tests (Vitest + Testing Library, `src/**/*.test.ts[x]`)
   - src/lib/kanban.test.ts and src/lib/api.test.ts: moveCard logic and API error handling
   - AppShell, AuthScreen, BoardsHome, AccountSettings, KanbanBoard, and AIChatSidebar each have a test file covering their flows and error states
   - Run with coverage: `npx vitest run --coverage`

2. Browser integration tests (`tests/`, mocked API)
   - tests/mockApi.ts: stateful page.route mock of auth, the board list, and per-board data, plus `signIn` and `openBoard` helpers
   - tests/kanban.spec.ts: sign-in, board edits, mouse and keyboard drag/drop, and the AI chat board-update flow
   - tests/workspace.spec.ts: creating and switching boards, reload persistence, column add/delete, account settings, card details, dragging while filtered, column reorder and WIP limits, title fit at 1280px, checklists, archive and restore, and the activity tab

3. Docker integration tests (`tests-docker/`, real backend)
   - Run `npm run test:e2e:docker` after `scripts/start.sh`. Covers a full new-user journey (register, add a card, card details and checklist, column order and WIP limit, activity messages, second board, logout and sign back in, archive a card, delete account), cross-user isolation over HTTP, and demo-board drag persistence. Each test removes the data it creates.

## Rules for future changes

- Keep the architecture simple and consistent with the current structure.
- Prefer small, focused component changes over broad rewrites.
- Keep API calls in src/lib/api.ts rather than calling fetch from components.
- Preserve the existing board model and test style.
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

# Backend AGENTS.md

## Purpose

This directory contains the FastAPI backend for the PM MVP. It serves the static frontend, exposes health and board API routes, and persists the demo user's Kanban board in SQLite.

## Current state

The backend now initializes the SQLite schema on first board access and seeds the demo user's first board. Board reads and full-board updates use the API's existing frontend-compatible JSON shape. AI routes are not implemented yet.

## Stack

- Python 3.12+
- FastAPI
- Uvicorn
- pytest for minimal API validation

## Current routes

- /: serves the static frontend when its export is available
- /api/hello: returns a JSON payload with a success message
- /health: returns the service status for health checks
- GET /api/board: returns the demo user's board
- PUT /api/board: validates and replaces the demo user's board

## Development commands

From the repository root:

```bash
uv run --project backend uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
uv run --project backend pytest backend/tests
```

## Validation

Backend tests cover static root serving, health routes, automatic SQLite creation, initial seed data, board updates, persistence, and invalid card membership. The runtime database is stored in `data/` locally and mounted at `/app/data` in Docker.

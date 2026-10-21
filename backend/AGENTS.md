# Backend AGENTS.md

## Purpose

This directory contains the FastAPI backend for the PM MVP. It is intentionally minimal at this stage and is responsible for hosting the app runtime, returning a simple hello-world HTML page, and exposing an API endpoint for smoke checks.

## Current state

The backend is in the initial scaffolding phase. It is not yet connected to the database or AI features, and it does not yet serve the frontend build. The current focus is to confirm that the app can start cleanly, respond over HTTP, and provide a stable foundation for later phases.

## Stack

- Python 3.12+
- FastAPI
- Uvicorn
- pytest for minimal API validation

## Current routes

- /: returns a simple HTML page with a hello-world message
- /api/hello: returns a JSON payload with a success message
- /health: returns the service status for health checks

## Development commands

From this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install "fastapi>=0.115.0" "uvicorn[standard]>=0.30.0" "pytest>=8.3.0" "httpx>=0.27.0"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Validation

A focused backend smoke test should verify:

- the root route returns HTML successfully
- the hello API route returns the expected JSON
- the health endpoint responds correctly

Do not over-engineer this phase. The goal is a stable local runtime and a clean starting point for the database and AI work that follows.

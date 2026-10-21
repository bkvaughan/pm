# Scripts AGENTS.md

## Purpose

This directory contains the local startup and shutdown scripts for the PM MVP project. The scripts are intentionally simple and should support local development without requiring manual Docker commands.

## Current scripts

- start.sh: starts the Docker container for the app on macOS/Linux
- stop.sh: stops the Docker container on macOS/Linux
- start.ps1: starts the Docker container on Windows PowerShell
- stop.ps1: stops the Docker container on Windows PowerShell
- start.bat: starts the Docker container on Windows Command Prompt
- stop.bat: stops the Docker container on Windows Command Prompt

## Expected behavior

Each script should:

- move to the repo root
- run the Docker Compose definition for the project
- expose the app on port 8000
- print a short success message to confirm the service is running

## Notes

This scaffolding phase is intentionally lightweight. It exists to make local execution repeatable and straightforward while the project moves through the later backend, frontend, and AI integration milestones.

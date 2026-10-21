from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="PM MVP Backend")

project_root = Path(__file__).resolve().parents[2]
frontend_dist = project_root / "frontend" / "out"


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "hello from PM MVP", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if frontend_dist.exists():

    @app.get("/")
    def root() -> FileResponse:
        return FileResponse(frontend_dist / "index.html")

    app.mount("/", StaticFiles(directory=frontend_dist), name="frontend")

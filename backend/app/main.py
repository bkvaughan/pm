from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import database
from app.assistant import (
    OPENROUTER_MODEL,
    AIAssistantRequest,
    AIAssistantResponse,
    run_assistant,
)
from app.models import (
    ActivityEntry,
    BoardData,
    BoardNameRequest,
    BoardSummary,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    RegisterRequest,
    UpdateAccountRequest,
    User,
)
from app.security import hash_password, verify_password

SESSION_COOKIE = "pm_session"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    database.initialize_database()
    yield


app = FastAPI(title="Kanban Studio", lifespan=lifespan)

project_root = Path(__file__).resolve().parents[2]
frontend_dist = project_root / "frontend" / "out"


def session_token(
    pm_session: Annotated[str | None, Cookie()] = None,
) -> str:
    if not pm_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    return pm_session


def current_user(token: Annotated[str, Depends(session_token)]) -> dict[str, Any]:
    user = database.get_session_user(token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    return user


CurrentUser = Annotated[dict[str, Any], Depends(current_user)]


def owned_board(board_id: str, user: CurrentUser) -> dict[str, Any]:
    summary = database.get_board_summary(user["id"], board_id)
    if summary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found.")
    return summary


OwnedBoard = Annotated[dict[str, Any], Depends(owned_board)]


def start_session(response: Response, user_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        database.create_session(user_id),
        max_age=int(database.SESSION_LIFETIME.total_seconds()),
        httponly=True,
        samesite="lax",
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Authentication and account


@app.post("/api/auth/register", response_model=User, status_code=201)
def register(request: RegisterRequest, response: Response) -> dict[str, Any]:
    try:
        user = database.create_user(
            request.username, request.displayName, hash_password(request.password)
        )
    except database.UsernameTakenError as error:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That username is already taken."
        ) from error
    start_session(response, user["id"])
    return user


@app.post("/api/auth/login", response_model=User)
def login(request: LoginRequest, response: Response) -> dict[str, Any]:
    credentials = database.get_credentials(request.username)
    if credentials is None or not verify_password(request.password, credentials[1]):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Incorrect username or password."
        )
    start_session(response, credentials[0]["id"])
    return credentials[0]


@app.post("/api/auth/logout", status_code=204)
def logout(
    response: Response, pm_session: Annotated[str | None, Cookie()] = None
) -> None:
    if pm_session:
        database.delete_session(pm_session)
    response.delete_cookie(SESSION_COOKIE)


@app.get("/api/auth/me", response_model=User)
def me(user: CurrentUser) -> dict[str, Any]:
    return user


@app.patch("/api/account", response_model=User)
def update_account(request: UpdateAccountRequest, user: CurrentUser) -> dict[str, Any]:
    return database.update_display_name(user["id"], request.displayName)


@app.post("/api/account/password", status_code=204)
def change_password(
    request: ChangePasswordRequest,
    user: CurrentUser,
    token: Annotated[str, Depends(session_token)],
) -> None:
    if not verify_password(request.currentPassword, database.get_password_hash(user["id"])):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    database.update_password(user["id"], hash_password(request.newPassword), token)


@app.post("/api/account/delete", status_code=204)
def delete_account(
    request: DeleteAccountRequest, user: CurrentUser, response: Response
) -> None:
    if not verify_password(request.password, database.get_password_hash(user["id"])):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is incorrect.")
    database.delete_user(user["id"])
    response.delete_cookie(SESSION_COOKIE)


# Boards


@app.get("/api/boards", response_model=list[BoardSummary])
def list_boards(user: CurrentUser) -> list[dict[str, Any]]:
    return database.list_boards(user["id"])


@app.post("/api/boards", response_model=BoardSummary, status_code=201)
def create_board(request: BoardNameRequest, user: CurrentUser) -> dict[str, Any]:
    return database.create_board(user["id"], request.name)


@app.patch("/api/boards/{board_id}", response_model=BoardSummary)
def rename_board(
    request: BoardNameRequest, board: OwnedBoard, user: CurrentUser
) -> dict[str, Any]:
    return database.rename_board(user["id"], board["id"], request.name)


@app.delete("/api/boards/{board_id}", status_code=204)
def delete_board(board: OwnedBoard) -> None:
    database.delete_board(board["id"])


@app.get("/api/boards/{board_id}", response_model=BoardData)
def read_board(board: OwnedBoard) -> dict[str, Any]:
    return database.get_board(board["id"])


@app.put("/api/boards/{board_id}", response_model=BoardData)
def update_board(data: BoardData, board: OwnedBoard) -> dict[str, Any]:
    board_data = data.model_dump(mode="json")
    database.save_board(board["id"], board_data)
    return board_data


@app.post("/api/boards/{board_id}/assistant", response_model=AIAssistantResponse)
async def assist_with_board(
    request: AIAssistantRequest, board: OwnedBoard
) -> AIAssistantResponse:
    current = BoardData.model_validate(database.get_board(board["id"]))
    reply, updated_board = await run_assistant(current, request)
    if updated_board is not None:
        database.save_board(
            board["id"], updated_board.model_dump(mode="json"), source="assistant"
        )
    return AIAssistantResponse(reply=reply, board=updated_board, model=OPENROUTER_MODEL)


@app.get("/api/boards/{board_id}/activity", response_model=list[ActivityEntry])
def board_activity(
    board: OwnedBoard, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[dict[str, Any]]:
    return database.list_activity(board["id"], limit)


if frontend_dist.exists():

    @app.get("/")
    def root() -> FileResponse:
        return FileResponse(frontend_dist / "index.html")

    app.mount("/", StaticFiles(directory=frontend_dist), name="frontend")

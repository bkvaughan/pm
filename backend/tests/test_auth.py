from datetime import timedelta
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import database
from conftest import ClientFactory, login, register


def test_register_signs_in_and_returns_the_user(client: TestClient) -> None:
    user = register(client, username="Alice", display_name="Alice Smith")

    assert user["username"] == "alice"
    assert user["displayName"] == "Alice Smith"
    assert user["id"].startswith("user-")
    assert "pm_session" in client.cookies
    assert client.get("/api/auth/me").json() == user


def test_register_rejects_a_taken_username_case_insensitively(
    client: TestClient,
) -> None:
    register(client, username="alice")

    response = client.post(
        "/api/auth/register",
        json={"username": "ALICE", "password": "another-pass", "displayName": "A"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "That username is already taken."


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "password": "long-enough", "displayName": "A"},
        {"username": "has space", "password": "long-enough", "displayName": "A"},
        {"username": "alice", "password": "short", "displayName": "A"},
        {"username": "alice", "password": "long-enough", "displayName": "   "},
        {"username": "alice", "password": "long-enough"},
    ],
)
def test_register_validates_input(client: TestClient, payload: dict) -> None:
    assert client.post("/api/auth/register", json=payload).status_code == 422


def test_passwords_are_stored_hashed(client: TestClient, db_path: Path) -> None:
    register(client, password="correct-horse")

    with sqlite3.connect(db_path) as connection:
        stored = connection.execute(
            "SELECT password_hash FROM users WHERE username = 'alice'"
        ).fetchone()[0]

    assert stored.startswith("scrypt$")
    assert "correct-horse" not in stored


def test_demo_user_can_sign_in(client: TestClient) -> None:
    user = login(client, "user", "password")

    assert user["username"] == "user"
    assert user["displayName"] == "Demo User"


@pytest.mark.parametrize(
    ("username", "password"), [("user", "wrong-password"), ("nobody", "password")]
)
def test_login_rejects_bad_credentials(
    client: TestClient, username: str, password: str
) -> None:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password."
    assert "pm_session" not in client.cookies


def test_login_username_is_case_insensitive(client: TestClient) -> None:
    assert login(client, " USER ", "password")["username"] == "user"


def test_logout_ends_the_session(demo_client: TestClient) -> None:
    token = demo_client.cookies["pm_session"]

    assert demo_client.post("/api/auth/logout").status_code == 204
    assert demo_client.get("/api/auth/me").status_code == 401
    assert database.get_session_user(token) is None


def test_logout_without_a_session_succeeds(client: TestClient) -> None:
    assert client.post("/api/auth/logout").status_code == 204


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/auth/me"),
        ("patch", "/api/account"),
        ("post", "/api/account/password"),
        ("post", "/api/account/delete"),
        ("get", "/api/boards"),
        ("post", "/api/boards"),
        ("get", "/api/boards/any"),
        ("put", "/api/boards/any"),
        ("patch", "/api/boards/any"),
        ("delete", "/api/boards/any"),
        ("post", "/api/boards/any/assistant"),
    ],
)
def test_protected_routes_require_a_session(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(method, path, json={})

    assert response.status_code == 401
    assert response.json()["detail"] == "Not signed in."


def test_an_unknown_session_token_is_rejected(client: TestClient) -> None:
    client.cookies.set("pm_session", "forged-token")

    assert client.get("/api/auth/me").status_code == 401


def test_expired_sessions_are_rejected(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(database, "SESSION_LIFETIME", timedelta(seconds=-1))
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    assert client.get("/api/auth/me").status_code == 401


def test_expired_sessions_are_pruned_on_sign_in(
    make_client: ClientFactory, db_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(database, "SESSION_LIFETIME", timedelta(seconds=-1))
    login(make_client(), "user", "password")
    monkeypatch.undo()
    monkeypatch.setattr(database, "DB_PATH", db_path)

    login(make_client(), "user", "password")

    with sqlite3.connect(db_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 1


def test_update_display_name(demo_client: TestClient) -> None:
    response = demo_client.patch("/api/account", json={"displayName": "  Dana  "})

    assert response.status_code == 200
    assert response.json()["displayName"] == "Dana"
    assert demo_client.get("/api/auth/me").json()["displayName"] == "Dana"


def test_change_password_requires_the_current_password(
    demo_client: TestClient,
) -> None:
    response = demo_client.post(
        "/api/account/password",
        json={"currentPassword": "wrong", "newPassword": "new-password"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Current password is incorrect."


def test_change_password_signs_out_other_sessions_only(
    make_client: ClientFactory,
) -> None:
    first = make_client()
    second = make_client()
    login(first, "user", "password")
    login(second, "user", "password")

    response = first.post(
        "/api/account/password",
        json={"currentPassword": "password", "newPassword": "new-password"},
    )

    assert response.status_code == 204
    assert first.get("/api/auth/me").status_code == 200
    assert second.get("/api/auth/me").status_code == 401
    third = make_client()
    assert (
        third.post(
            "/api/auth/login", json={"username": "user", "password": "password"}
        ).status_code
        == 401
    )
    login(third, "user", "new-password")


def test_delete_account_requires_the_password(demo_client: TestClient) -> None:
    response = demo_client.post("/api/account/delete", json={"password": "wrong"})

    assert response.status_code == 400
    assert demo_client.get("/api/auth/me").status_code == 200


def test_delete_account_removes_the_user_and_their_boards(
    client: TestClient, db_path: Path
) -> None:
    register(client)

    response = client.post("/api/account/delete", json={"password": "correct-horse"})

    assert response.status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "correct-horse"},
        ).status_code
        == 401
    )
    with sqlite3.connect(db_path) as connection:
        owners = connection.execute("SELECT DISTINCT user_id FROM boards").fetchall()
        sessions = connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    assert len(owners) == 1  # only the demo user's board remains
    assert sessions == 0

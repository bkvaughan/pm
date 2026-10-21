from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_serves_frontend_index() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban Studio" in response.text


def test_api_hello_returns_success_message() -> None:
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "hello from PM MVP", "status": "ok"}


def test_health_route() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

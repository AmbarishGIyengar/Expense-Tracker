from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from .database import get_session
from .main import app

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
SQLModel.metadata.create_all(engine)
app.dependency_overrides[get_session] = lambda: Session(engine)
client = TestClient(app)

created = client.post("/api/expenses", json={
    "date": "2026-10-01", "description": "lunch", "amount": 150, "category": "Food & Dining",
}).json()
assert created["id"] is not None

listed = client.get("/api/expenses").json()
assert len(listed) == 1 and listed[0]["description"] == "lunch"

assert client.delete(f"/api/expenses/{created['id']}").status_code == 204
assert client.get("/api/expenses").json() == []
assert client.delete(f"/api/expenses/{created['id']}").status_code == 404

print("all backend self-checks passed")

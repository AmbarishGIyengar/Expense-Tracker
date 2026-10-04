from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from .database import get_session
from .importers import parse_rows
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

# parse_rows: single signed "Amount" column — negative is a spend, positive is a credit to skip
assert parse_rows([
    {"Date": "04/10/2026", "Description": "Swiggy dinner", "Amount": "-450.00"},
    {"Date": "05/10/2026", "Description": "Salary", "Amount": "20000"},
]) == [{"date": "2026-10-04", "description": "Swiggy dinner", "amount": 450.0}]

# parse_rows: separate Debit/Credit columns — blank debit cell means it was a credit row
assert parse_rows([
    {"Date": "2026-10-05", "Narration": "Bus fare", "Debit": "40", "Credit": ""},
    {"Date": "2026-10-06", "Narration": "Refund", "Debit": "", "Credit": "100"},
]) == [{"date": "2026-10-05", "description": "Bus fare", "amount": 40.0}]

# CSV import via the API: dedups on re-upload, categorizes from description
csv_bytes = b"Date,Description,Amount\n04/10/2026,Swiggy dinner,-450.00\n05/10/2026,Salary,20000\n"
first = client.post("/api/expenses/import", files={"file": ("statement.csv", csv_bytes, "text/csv")}).json()
assert first == {"total_rows": 1, "imported": 1, "skipped_duplicates": 0}
again = client.post("/api/expenses/import", files={"file": ("statement.csv", csv_bytes, "text/csv")}).json()
assert again == {"total_rows": 1, "imported": 0, "skipped_duplicates": 1}
imported_expense = client.get("/api/expenses").json()[0]
assert imported_expense["category"] == "Food & Dining" and imported_expense["source"] == "csv"
client.delete(f"/api/expenses/{imported_expense['id']}")

print("all backend self-checks passed")

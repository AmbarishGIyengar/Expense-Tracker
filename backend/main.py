from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from .database import get_session, init_db
from .models import Expense, ExpenseCreate

FRONTEND_DIR = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Expense Tracker", lifespan=lifespan)


@app.get("/api/expenses", response_model=List[Expense])
def list_expenses(session: Session = Depends(get_session)):
    return session.exec(select(Expense)).all()


@app.post("/api/expenses", response_model=Expense)
def create_expense(expense: ExpenseCreate, session: Session = Depends(get_session)):
    db_expense = Expense(**expense.model_dump())
    session.add(db_expense)
    session.commit()
    session.refresh(db_expense)
    return db_expense


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int, session: Session = Depends(get_session)):
    db_expense = session.get(Expense, expense_id)
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    session.delete(db_expense)
    session.commit()


# Serves index.html / app.js for everything else; must come after the API routes.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

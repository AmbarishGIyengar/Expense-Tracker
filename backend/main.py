import hashlib
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from .categorize import categorize
from .database import get_session, init_db
from .importers import StatementFormatError, parse_csv, parse_pdf, parse_xlsx
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


@app.post("/api/expenses/import")
async def import_statement(file: UploadFile = File(...), session: Session = Depends(get_session)):
    name = (file.filename or '').lower()
    content = await file.read()

    try:
        if name.endswith('.csv'):
            source, rows = 'csv', parse_csv(content)
        elif name.endswith('.pdf'):
            source, rows = 'pdf', parse_pdf(content)
        elif name.endswith('.xlsx'):
            source, rows = 'xlsx', parse_xlsx(content)
        else:
            raise HTTPException(status_code=400, detail='Only .csv, .pdf, and .xlsx files are supported')
    except StatementFormatError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not rows:
        raise HTTPException(status_code=422, detail="Couldn't find any transactions in that file")

    existing_hashes = set(session.exec(select(Expense.row_hash)).all())
    imported = 0
    for row in rows:
        # Prefer the statement's own reference number (unique per transaction) so
        # same-day, same-amount, same-payee transactions aren't mistaken for duplicates.
        dedup_key = f"ref|{row['ref_no']}" if row.get('ref_no') else f"{row['date']}|{row['description']}|{row['amount']}"
        row_hash = hashlib.sha256(dedup_key.encode()).hexdigest()
        if row_hash in existing_hashes:
            continue
        existing_hashes.add(row_hash)
        session.add(Expense(
            date=date.fromisoformat(row['date']), description=row['description'], amount=row['amount'],
            category=row.get('category') or categorize(row['description']), source=source, row_hash=row_hash,
        ))
        imported += 1
    session.commit()

    return {'total_rows': len(rows), 'imported': imported, 'skipped_duplicates': len(rows) - imported}


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int, session: Session = Depends(get_session)):
    db_expense = session.get(Expense, expense_id)
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    session.delete(db_expense)
    session.commit()


# Serves index.html / app.js for everything else; must come after the API routes.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

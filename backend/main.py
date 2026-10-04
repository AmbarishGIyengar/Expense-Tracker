import hashlib
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import List

from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from .auth import SESSION_COOKIE, create_session, get_current_user, hash_password, verify_password
from .categorize import categorize
from .database import get_session, init_db
from .importers import StatementFormatError, parse_csv, parse_pdf, parse_xlsx
from .models import Expense, ExpenseCreate, User, UserCreate, UserSession

FRONTEND_DIR = Path(__file__).resolve().parent.parent
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Expense Tracker", lifespan=lifespan)


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax", max_age=SESSION_MAX_AGE)


@app.post("/api/auth/signup")
def signup(payload: UserCreate, response: Response, session: Session = Depends(get_session)):
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(username=username, password_hash=hash_password(payload.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_session(user.id, session)
    _set_session_cookie(response, token)
    return {"username": user.username}


@app.post("/api/auth/login")
def login(payload: UserCreate, response: Response, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == payload.username.strip())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_session(user.id, session)
    _set_session_cookie(response, token)
    return {"username": user.username}


@app.post("/api/auth/logout")
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    session: Session = Depends(get_session),
):
    if session_token:
        record = session.get(UserSession, session_token)
        if record:
            session.delete(record)
            session.commit()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"username": user.username}


@app.get("/api/expenses", response_model=List[Expense])
def list_expenses(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return session.exec(select(Expense).where(Expense.user_id == user.id)).all()


@app.post("/api/expenses", response_model=Expense)
def create_expense(
    expense: ExpenseCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    db_expense = Expense(**expense.model_dump(), user_id=user.id)
    session.add(db_expense)
    session.commit()
    session.refresh(db_expense)
    return db_expense


@app.post("/api/expenses/import")
async def import_statement(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
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

    existing_hashes = set(
        session.exec(select(Expense.row_hash).where(Expense.user_id == user.id)).all()
    )
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
            user_id=user.id, date=date.fromisoformat(row['date']), description=row['description'],
            amount=row['amount'], category=row.get('category') or categorize(row['description']),
            source=source, row_hash=row_hash,
        ))
        imported += 1
    session.commit()

    return {'total_rows': len(rows), 'imported': imported, 'skipped_duplicates': len(rows) - imported}


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    db_expense = session.get(Expense, expense_id)
    if not db_expense or db_expense.user_id != user.id:
        raise HTTPException(status_code=404, detail="Expense not found")
    session.delete(db_expense)
    session.commit()


# Serves index.html / app.js for everything else; must come after the API routes.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

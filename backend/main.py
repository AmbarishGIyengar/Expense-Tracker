import hashlib
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select
from starlette.middleware.sessions import SessionMiddleware

from .auth import SESSION_SECRET, get_current_user, hash_password, validate_credentials, verify_password
from .categorize import categorize
from .database import get_session, init_db
from .importers import StatementFormatError, parse_csv, parse_pdf, parse_xlsx
from .models import AuthCredentials, Expense, ExpenseCreate, User, UserPublic

FRONTEND_DIR = Path(__file__).resolve().parent.parent
MAX_IMPORT_BYTES = 5 * 1024 * 1024  # 5 MB — a bank statement export has no business being bigger
ALLOWED_IMPORT_EXTENSIONS = {'.csv', '.pdf', '.xlsx'}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Expense Tracker", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax")


@app.post("/api/auth/signup", response_model=UserPublic, status_code=201)
def signup(credentials: AuthCredentials, request: Request, session: Session = Depends(get_session)):
    email = credentials.email.strip().lower()
    validate_credentials(email, credentials.password)
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    user = User(email=email, password_hash=hash_password(credentials.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    request.session["user_id"] = user.id
    return user


@app.post("/api/auth/login", response_model=UserPublic)
def login(credentials: AuthCredentials, request: Request, session: Session = Depends(get_session)):
    email = credentials.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    request.session["user_id"] = user.id
    return user


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request):
    request.session.clear()


@app.get("/api/auth/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)):
    return user


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
    file: UploadFile = File(...), user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    name = (file.filename or '').lower()
    extension = next((ext for ext in ALLOWED_IMPORT_EXTENSIONS if name.endswith(ext)), None)
    if not extension:
        raise HTTPException(status_code=400, detail='Only .csv, .pdf, and .xlsx files are supported')

    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail='File is too large (max 5 MB)')

    try:
        if extension == '.csv':
            source, rows = 'csv', parse_csv(content)
        elif extension == '.xlsx':
            source, rows = 'xlsx', parse_xlsx(content)
        else:
            source, rows = 'pdf', parse_pdf(content)
    except StatementFormatError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not rows:
        raise HTTPException(status_code=422, detail="Couldn't find any transactions in that file")

    existing_hashes = set(session.exec(
        select(Expense.row_hash).where(Expense.user_id == user.id)
    ).all())
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

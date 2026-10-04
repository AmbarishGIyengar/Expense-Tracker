import uuid
from datetime import date as date_type
from typing import Optional

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str


class UserCreate(SQLModel):
    username: str
    password: str


class UserSession(SQLModel, table=True):
    token: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)


class Expense(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    date: date_type
    description: str
    amount: float
    category: str
    source: str = "manual"
    # Dedup key for statement imports; uniqueness is enforced per-user in main.py,
    # not at the column level, since two users' hashes can legitimately collide.
    row_hash: str = Field(default_factory=lambda: uuid.uuid4().hex, index=True)


class ExpenseCreate(SQLModel):
    date: date_type
    description: str
    amount: float
    category: str

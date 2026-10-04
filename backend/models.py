import uuid
from datetime import date as date_type
from typing import Optional

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str


class Expense(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    date: date_type
    description: str
    amount: float
    category: str
    source: str = "manual"
    row_hash: str = Field(default_factory=lambda: uuid.uuid4().hex, index=True)


class ExpenseCreate(SQLModel):
    date: date_type
    description: str
    amount: float
    category: str


class AuthCredentials(SQLModel):
    email: str
    password: str


class UserPublic(SQLModel):
    id: int
    email: str
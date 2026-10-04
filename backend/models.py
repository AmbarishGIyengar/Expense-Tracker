import uuid
from datetime import date as date_type
from typing import Optional

from sqlmodel import Field, SQLModel


class Expense(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: date_type
    description: str
    amount: float
    category: str
    source: str = "manual"
    row_hash: str = Field(default_factory=lambda: uuid.uuid4().hex, unique=True, index=True)


class ExpenseCreate(SQLModel):
    date: date_type
    description: str
    amount: float
    category: str
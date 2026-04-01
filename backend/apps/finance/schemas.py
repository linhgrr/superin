"""Finance plugin Pydantic request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CreateWalletRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    currency: str = Field(default="USD", max_length=3)


class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    icon: str = Field(default="Tag")
    color: str = Field(default="oklch(0.65 0.21 280)")
    budget: float = Field(default=0.0, ge=0)


class CreateTransactionRequest(BaseModel):
    wallet_id: str
    category_id: str
    type: Literal["income", "expense"]
    amount: float = Field(gt=0)
    date: datetime
    note: str | None = None


class TransferRequest(BaseModel):
    from_wallet_id: str
    to_wallet_id: str
    amount: float = Field(gt=0)
    note: str | None = None

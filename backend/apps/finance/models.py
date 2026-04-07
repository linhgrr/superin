"""Finance plugin Beanie document models."""

from __future__ import annotations

from datetime import UTC, datetime

from beanie import Document, PydanticObjectId
from pydantic import Field

from apps.finance.enums import TransactionType


class Wallet(Document):
    """A named wallet holding a balance."""

    user_id: PydanticObjectId
    name: str
    currency: str = "USD"
    balance: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "finance_wallets"
        indexes = [
            [("user_id", 1)],
            [("user_id", 1), ("name", 1)],
        ]


class Category(Document):
    """A spending/income category."""

    user_id: PydanticObjectId
    name: str
    icon: str = "Tag"
    color: str = "oklch(0.65 0.21 280)"
    budget: float = 0.0  # monthly budget (0 = no limit)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "finance_categories"
        indexes = [
            [("user_id", 1)],
        ]


class Transaction(Document):
    """A single income or expense transaction."""

    user_id: PydanticObjectId
    wallet_id: PydanticObjectId
    category_id: PydanticObjectId
    type: TransactionType
    amount: float
    date: datetime
    note: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "finance_transactions"
        indexes = [
            [("user_id", 1), ("date", -1)],
            [("user_id", 1), ("type", 1)],
            [("user_id", 1), ("category_id", 1)],
        ]

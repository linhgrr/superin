"""Finance plugin Beanie document models."""

from __future__ import annotations

from datetime import datetime

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

from apps.finance.enums import TransactionType
from core.utils.timezone import utc_now


class Wallet(Document):
    """A named wallet holding a balance."""

    user_id: PydanticObjectId
    name: str
    name_key: str
    currency: str = "USD"
    balance: float = 0.0
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "finance_wallets"
        indexes = [
            IndexModel([("user_id", 1)], name="finance_wallets_user_id"),
            IndexModel(
                [("user_id", 1), ("name_key", 1)],
                name="finance_wallets_user_id_name_key_unique",
                unique=True,
            ),
        ]


class Category(Document):
    """A spending/income category."""

    user_id: PydanticObjectId
    name: str
    name_key: str
    icon: str = "Tag"
    color: str = "oklch(0.65 0.21 280)"
    budget: float = 0.0  # monthly budget (0 = no limit)
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "finance_categories"
        indexes = [
            IndexModel([("user_id", 1)], name="finance_categories_user_id"),
            IndexModel(
                [("user_id", 1), ("name_key", 1)],
                name="finance_categories_user_id_name_key_unique",
                unique=True,
            ),
        ]


class Transaction(Document):
    """A single income or expense transaction."""

    user_id: PydanticObjectId
    wallet_id: PydanticObjectId
    category_id: PydanticObjectId
    type: TransactionType
    amount: float
    occurred_at: datetime
    note: str | None = None
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "finance_transactions"
        indexes = [
            IndexModel(
                [("user_id", 1), ("occurred_at", -1)],
                name="finance_transactions_user_id_occurred_at",
            ),
            IndexModel(
                [("user_id", 1), ("type", 1)],
                name="finance_transactions_user_id_type",
            ),
            IndexModel(
                [("user_id", 1), ("category_id", 1)],
                name="finance_transactions_user_id_category_id",
            ),
        ]

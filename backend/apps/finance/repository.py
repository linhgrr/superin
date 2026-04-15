"""Finance plugin data access layer — Beanie queries only, no business logic."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime

from beanie import PydanticObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.client_session import AsyncClientSession

from apps.finance.enums import TransactionType
from apps.finance.models import Category, Transaction, Wallet
from core.db import get_db, get_document_collection
from core.utils.timezone import normalize_name_key


@asynccontextmanager
async def finance_transaction() -> AsyncIterator[AsyncClientSession]:
    """Yield a Mongo session with an active transaction for finance mutations."""
    async with await get_db().client.start_session() as session:
        async with session.start_transaction():
            yield session


class WalletRepository:
    async def find_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[Wallet]:
        return await Wallet.find(
            Wallet.user_id == PydanticObjectId(user_id),
            session=session,
        ).to_list()

    async def count_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> int:
        return await Wallet.find(
            Wallet.user_id == PydanticObjectId(user_id),
            session=session,
        ).count()

    async def find_by_id(
        self,
        wallet_id: str,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Wallet | None:
        return await Wallet.find_one(
            Wallet.id == PydanticObjectId(wallet_id),
            Wallet.user_id == PydanticObjectId(user_id),
            session=session,
        )

    async def find_by_name(
        self,
        user_id: str,
        name: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Wallet | None:
        return await Wallet.find_one(
            Wallet.user_id == PydanticObjectId(user_id),
            Wallet.name_key == normalize_name_key(name),
            session=session,
        )

    async def create(
        self,
        user_id: str,
        name: str,
        currency: str = "USD",
        *,
        session: AsyncClientSession | None = None,
    ) -> Wallet:
        wallet = Wallet(
            user_id=PydanticObjectId(user_id),
            name=name,
            name_key=normalize_name_key(name),
            currency=currency,
            balance=0.0,
        )
        await wallet.insert(session=session)
        return wallet

    async def rename(
        self,
        wallet: Wallet,
        *,
        name: str,
        session: AsyncClientSession | None = None,
    ) -> Wallet:
        wallet.name = name
        wallet.name_key = normalize_name_key(name)
        await wallet.save(session=session)
        return wallet

    async def apply_balance_delta(
        self,
        wallet_id: str,
        user_id: str,
        delta: float,
        *,
        min_balance: float | None = None,
        session: AsyncClientSession | None = None,
    ) -> Wallet | None:
        query: dict[str, object] = {
            "_id": PydanticObjectId(wallet_id),
            "user_id": PydanticObjectId(user_id),
        }
        if min_balance is not None:
            query["balance"] = {"$gte": min_balance}

        updated = await get_document_collection(Wallet).find_one_and_update(
            query,
            [
                {
                    "$set": {
                        "balance": {
                            "$round": [
                                {"$add": ["$balance", delta]},
                                2,
                            ]
                        }
                    }
                }
            ],
            return_document=ReturnDocument.AFTER,
            session=session,
        )
        if updated is None:
            return None
        return Wallet.model_validate(updated)

    async def delete(
        self,
        wallet: Wallet,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await wallet.delete(session=session)

    async def delete_all_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await Wallet.find(
            Wallet.user_id == PydanticObjectId(user_id),
            session=session,
        ).delete(session=session)


class CategoryRepository:
    async def find_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[Category]:
        return await Category.find(
            Category.user_id == PydanticObjectId(user_id),
            session=session,
        ).to_list()

    async def find_by_id(
        self,
        category_id: str,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Category | None:
        return await Category.find_one(
            Category.id == PydanticObjectId(category_id),
            Category.user_id == PydanticObjectId(user_id),
            session=session,
        )

    async def find_by_name(
        self,
        user_id: str,
        name: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Category | None:
        return await Category.find_one(
            Category.user_id == PydanticObjectId(user_id),
            Category.name_key == normalize_name_key(name),
            session=session,
        )

    async def create(
        self,
        user_id: str,
        name: str,
        icon: str = "Tag",
        color: str = "oklch(0.65 0.21 280)",
        budget: float = 0.0,
        *,
        session: AsyncClientSession | None = None,
    ) -> Category:
        category = Category(
            user_id=PydanticObjectId(user_id),
            name=name,
            name_key=normalize_name_key(name),
            icon=icon,
            color=color,
            budget=budget,
        )
        await category.insert(session=session)
        return category

    async def update(
        self,
        category: Category,
        *,
        name: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        budget: float | None = None,
        session: AsyncClientSession | None = None,
    ) -> Category:
        if name is not None:
            category.name = name
            category.name_key = normalize_name_key(name)
        if icon is not None:
            category.icon = icon
        if color is not None:
            category.color = color
        if budget is not None:
            category.budget = budget
        await category.save(session=session)
        return category

    async def delete(
        self,
        category: Category,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await category.delete(session=session)

    async def delete_all_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await Category.find(
            Category.user_id == PydanticObjectId(user_id),
            session=session,
        ).delete(session=session)


class TransactionRepository:
    async def find_by_user(
        self,
        user_id: str,
        type_: str | None = None,
        category_id: str | None = None,
        wallet_id: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        skip: int = 0,
        limit: int = 20,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[Transaction]:
        query = Transaction.user_id == PydanticObjectId(user_id)
        if type_:
            query = query and Transaction.type == type_
        if category_id:
            query = query and Transaction.category_id == PydanticObjectId(category_id)
        if wallet_id:
            query = query and Transaction.wallet_id == PydanticObjectId(wallet_id)
        if start_date:
            query = query and Transaction.date >= start_date
        if end_date:
            query = query and Transaction.date <= end_date

        return (
            await Transaction.find(query, session=session)
            .sort("-date")
            .skip(skip)
            .limit(limit)
            .to_list()
        )

    async def find_by_id(
        self,
        transaction_id: str,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Transaction | None:
        return await Transaction.find_one(
            Transaction.id == PydanticObjectId(transaction_id),
            Transaction.user_id == PydanticObjectId(user_id),
            session=session,
        )

    async def create(
        self,
        user_id: str,
        wallet_id: str,
        category_id: str,
        type_: TransactionType,
        amount: float,
        date: datetime,
        note: str | None = None,
        *,
        session: AsyncClientSession | None = None,
    ) -> Transaction:
        tx = Transaction(
            user_id=PydanticObjectId(user_id),
            wallet_id=PydanticObjectId(wallet_id),
            category_id=PydanticObjectId(category_id),
            type=type_,
            amount=amount,
            date=date,
            note=note,
        )
        await tx.insert(session=session)
        return tx

    async def save(
        self,
        transaction: Transaction,
        *,
        session: AsyncClientSession | None = None,
    ) -> Transaction:
        await transaction.save(session=session)
        return transaction

    async def delete(
        self,
        transaction: Transaction,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await transaction.delete(session=session)

    async def delete_all_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await Transaction.find(
            Transaction.user_id == PydanticObjectId(user_id),
            session=session,
        ).delete(session=session)

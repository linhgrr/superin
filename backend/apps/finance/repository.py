"""Finance plugin data access layer — Beanie queries only, no business logic."""

from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId

from apps.finance.models import Category, Transaction, Wallet


class WalletRepository:
    async def find_by_user(self, user_id: str) -> list[Wallet]:
        return await Wallet.find(Wallet.user_id == PydanticObjectId(user_id)).to_list()

    async def find_by_id(self, wallet_id: str, user_id: str) -> Wallet | None:
        return await Wallet.find_one(
            Wallet.id == PydanticObjectId(wallet_id),
            Wallet.user_id == PydanticObjectId(user_id),
        )

    async def create(self, user_id: str, name: str, currency: str = "USD") -> Wallet:
        wallet = Wallet(
            user_id=PydanticObjectId(user_id),
            name=name,
            currency=currency,
            balance=0.0,
        )
        await wallet.insert()
        return wallet

    async def update_balance(self, wallet: Wallet, delta: float) -> Wallet:
        wallet.balance = round(wallet.balance + delta, 2)
        await wallet.save()
        return wallet

    async def delete_all_by_user(self, user_id: str) -> None:
        await Wallet.find(Wallet.user_id == PydanticObjectId(user_id)).delete()


class CategoryRepository:
    async def find_by_user(self, user_id: str) -> list[Category]:
        return await Category.find(Category.user_id == PydanticObjectId(user_id)).to_list()

    async def find_by_id(self, category_id: str, user_id: str) -> Category | None:
        return await Category.find_one(
            Category.id == PydanticObjectId(category_id),
            Category.user_id == PydanticObjectId(user_id),
        )

    async def create(
        self,
        user_id: str,
        name: str,
        icon: str = "Tag",
        color: str = "oklch(0.65 0.21 280)",
        budget: float = 0.0,
    ) -> Category:
        category = Category(
            user_id=PydanticObjectId(user_id),
            name=name,
            icon=icon,
            color=color,
            budget=budget,
        )
        await category.insert()
        return category

    async def delete_all_by_user(self, user_id: str) -> None:
        await Category.find(Category.user_id == PydanticObjectId(user_id)).delete()


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
            await Transaction.find(query)
            .sort("-date")
            .skip(skip)
            .limit(limit)
            .to_list()
        )

    async def find_by_id(self, transaction_id: str, user_id: str) -> Transaction | None:
        return await Transaction.find_one(
            Transaction.id == PydanticObjectId(transaction_id),
            Transaction.user_id == PydanticObjectId(user_id),
        )

    async def create(
        self,
        user_id: str,
        wallet_id: str,
        category_id: str,
        type_: Literal["income", "expense"],
        amount: float,
        date: datetime,
        note: str | None = None,
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
        await tx.insert()
        return tx

    async def delete_all_by_user(self, user_id: str) -> None:
        await Transaction.find(Transaction.user_id == PydanticObjectId(user_id)).delete()

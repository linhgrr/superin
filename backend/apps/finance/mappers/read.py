"""Mappings from finance persistence models to response schemas."""

from apps.finance.models import Category, Transaction, Wallet
from apps.finance.schemas import FinanceCategoryRead, FinanceTransactionRead, FinanceWalletRead


def wallet_to_read(wallet: Wallet) -> FinanceWalletRead:
    return FinanceWalletRead(
        id=str(wallet.id),
        name=wallet.name,
        currency=wallet.currency,
        balance=wallet.balance,
        created_at=wallet.created_at,
    )


def category_to_read(category: Category) -> FinanceCategoryRead:
    return FinanceCategoryRead(
        id=str(category.id),
        name=category.name,
        icon=category.icon,
        color=category.color,
        budget=category.budget,
        created_at=category.created_at,
    )


def transaction_to_read(transaction: Transaction) -> FinanceTransactionRead:
    return FinanceTransactionRead(
        id=str(transaction.id),
        wallet_id=str(transaction.wallet_id),
        category_id=str(transaction.category_id),
        type=transaction.type,
        amount=transaction.amount,
        occurred_at=transaction.occurred_at,
        note=transaction.note,
        created_at=transaction.created_at,
    )

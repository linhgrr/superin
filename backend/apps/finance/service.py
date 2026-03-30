"""Finance plugin business logic — thin wrappers over repository."""

from datetime import datetime
from typing import Literal

from apps.finance.repository import WalletRepository, CategoryRepository, TransactionRepository
from apps.finance.models import Wallet, Transaction, Category


class FinanceService:
    """Business logic for the finance plugin."""

    def __init__(self) -> None:
        self.wallets = WalletRepository()
        self.categories = CategoryRepository()
        self.transactions = TransactionRepository()

    # ─── Wallets ───────────────────────────────────────────────────────────────

    async def list_wallets(self, user_id: str) -> list[dict]:
        wallets = await self.wallets.find_by_user(user_id)
        return [_wallet_to_dict(w) for w in wallets]

    async def create_wallet(self, user_id: str, name: str, currency: str = "USD") -> dict:
        existing = await self.wallets.find_by_id(None, user_id)
        # check by name
        all_wallets = await self.wallets.find_by_user(user_id)
        if any(w.name.lower() == name.lower() for w in all_wallets):
            raise ValueError(f"Wallet '{name}' already exists")
        wallet = await self.wallets.create(user_id, name, currency)
        return _wallet_to_dict(wallet)

    async def get_wallet(self, wallet_id: str, user_id: str) -> dict | None:
        wallet = await self.wallets.find_by_id(wallet_id, user_id)
        return _wallet_to_dict(wallet) if wallet else None

    # ─── Categories ─────────────────────────────────────────────────────────────

    async def list_categories(self, user_id: str) -> list[dict]:
        categories = await self.categories.find_by_user(user_id)
        return [_category_to_dict(c) for c in categories]

    async def create_category(
        self,
        user_id: str,
        name: str,
        icon: str = "Tag",
        color: str = "oklch(0.65 0.21 280)",
        budget: float = 0.0,
    ) -> dict:
        category = await self.categories.create(user_id, name, icon, color, budget)
        return _category_to_dict(category)

    # ─── Transactions ──────────────────────────────────────────────────────────

    async def list_transactions(
        self,
        user_id: str,
        type_: str | None = None,
        category_id: str | None = None,
        wallet_id: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> list[dict]:
        txs = await self.transactions.find_by_user(
            user_id, type_, category_id, wallet_id, skip, limit
        )
        return [_tx_to_dict(t) for t in txs]

    async def add_transaction(
        self,
        user_id: str,
        wallet_id: str,
        category_id: str,
        type_: Literal["income", "expense"],
        amount: float,
        date: datetime,
        note: str | None = None,
    ) -> dict:
        if amount <= 0:
            raise ValueError("Amount must be positive")

        wallet = await self.wallets.find_by_id(wallet_id, user_id)
        if not wallet:
            raise ValueError("Wallet not found")

        if type_ == "expense" and wallet.balance < amount:
            raise ValueError("Insufficient balance")

        tx = await self.transactions.create(
            user_id, wallet_id, category_id, type_, amount, date, note
        )

        # Update wallet balance
        delta = amount if type_ == "income" else -amount
        await self.wallets.update_balance(wallet, delta)

        return _tx_to_dict(tx)

    # ─── Transfer ────────────────────────────────────────────────────────────────

    async def transfer(
        self,
        user_id: str,
        from_wallet_id: str,
        to_wallet_id: str,
        amount: float,
        note: str | None = None,
    ) -> dict:
        if amount <= 0:
            raise ValueError("Transfer amount must be positive")
        if from_wallet_id == to_wallet_id:
            raise ValueError("Cannot transfer to the same wallet")

        src = await self.wallets.find_by_id(from_wallet_id, user_id)
        if not src:
            raise ValueError("Source wallet not found")
        if src.balance < amount:
            raise ValueError("Insufficient balance")

        dst = await self.wallets.find_by_id(to_wallet_id, user_id)
        if not dst:
            raise ValueError("Destination wallet not found")

        await self.wallets.update_balance(src, -amount)
        await self.wallets.update_balance(dst, amount)

        # Create transfer category if it doesn't exist
        transfer_cat = await self.categories.find_by_user(user_id)
        transfer_cat_entry = next(
            (c for c in transfer_cat if c.name == "Internal Transfer"), None
        )
        if not transfer_cat_entry:
            transfer_cat_entry = await self.categories.create(
                user_id, "Internal Transfer", "ArrowLeftRight", "oklch(0.65 0.21 280)", 0.0
            )

        # Record paired transactions
        now = datetime.utcnow()
        note_str = f": {note}" if note else ""
        await self.transactions.create(
            user_id, from_wallet_id, str(transfer_cat_entry.id),
            "expense", amount, now, f"Transfer to {dst.name}{note_str}"
        )
        await self.transactions.create(
            user_id, to_wallet_id, str(transfer_cat_entry.id),
            "income", amount, now, f"Transfer from {src.name}{note_str}"
        )

        return {
            "from_wallet": _wallet_to_dict(src),
            "to_wallet": _wallet_to_dict(dst),
            "amount": amount,
            "note": note,
        }

    # ─── Summary ────────────────────────────────────────────────────────────────

    async def get_summary(self, user_id: str) -> dict:
        wallets = await self.wallets.find_by_user(user_id)
        total_balance = sum(w.balance for w in wallets)

        now = datetime.utcnow()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        txs = await self.transactions.find_by_user(user_id, skip=0, limit=10000)
        month_txs = [t for t in txs if t.date >= start_of_month]

        income = sum(t.amount for t in month_txs if t.type == "income")
        expense = sum(t.amount for t in month_txs if t.type in ("expense", "transfer_out"))

        return {
            "total_balance": total_balance,
            "income_this_month": income,
            "expense_this_month": expense,
            "transaction_count": len(txs),
            "wallet_count": len(wallets),
        }

    # ─── Install / Uninstall hooks ──────────────────────────────────────────────

    async def on_install(self, user_id: str) -> None:
        """Seed default data for a new user."""
        await self.wallets.create(user_id, "Main Wallet", "USD")
        for name in ["Food", "Transport", "Entertainment", "Shopping", "Salary"]:
            await self.categories.create(user_id, name)

    async def on_uninstall(self, user_id: str) -> None:
        await self.wallets.delete_all_by_user(user_id)
        await self.categories.delete_all_by_user(user_id)
        await self.transactions.delete_all_by_user(user_id)


# ─── DTO helpers ───────────────────────────────────────────────────────────────

def _wallet_to_dict(w: Wallet) -> dict:
    return {
        "id": str(w.id),
        "name": w.name,
        "currency": w.currency,
        "balance": w.balance,
        "created_at": w.created_at.isoformat(),
    }


def _category_to_dict(c: Category) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "icon": c.icon,
        "color": c.color,
        "budget": c.budget,
        "created_at": c.created_at.isoformat(),
    }


def _tx_to_dict(t: Transaction) -> dict:
    return {
        "id": str(t.id),
        "wallet_id": str(t.wallet_id),
        "category_id": str(t.category_id),
        "type": t.type,
        "amount": t.amount,
        "date": t.date.isoformat(),
        "note": t.note,
        "created_at": t.created_at.isoformat(),
    }


# Singleton
finance_service = FinanceService()

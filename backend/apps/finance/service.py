"""Finance plugin business logic — thin wrappers over repository."""

from datetime import datetime
from typing import Literal

from apps.finance.models import Category, Transaction, Wallet
from apps.finance.repository import CategoryRepository, TransactionRepository, WalletRepository


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
        # Check by name for duplicates
        all_wallets = await self.wallets.find_by_user(user_id)
        if any(w.name.lower() == name.lower() for w in all_wallets):
            raise ValueError(f"Wallet '{name}' already exists")
        wallet = await self.wallets.create(user_id, name, currency)
        return _wallet_to_dict(wallet)

    async def get_wallet(self, wallet_id: str, user_id: str) -> dict | None:
        wallet = await self.wallets.find_by_id(wallet_id, user_id)
        return _wallet_to_dict(wallet) if wallet else None

    async def update_wallet(self, wallet_id: str, user_id: str, name: str | None = None) -> dict:
        """Update a wallet's name."""
        wallet = await self.wallets.find_by_id(wallet_id, user_id)
        if not wallet:
            raise ValueError("Wallet not found")
        if name is not None:
            wallet.name = name
            await wallet.save()
        return _wallet_to_dict(wallet)

    async def delete_wallet(self, wallet_id: str, user_id: str) -> dict:
        """Delete a wallet if it's empty (no balance and no transactions)."""
        wallet = await self.wallets.find_by_id(wallet_id, user_id)
        if not wallet:
            raise ValueError("Wallet not found")
        if wallet.balance != 0:
            raise ValueError("Cannot delete wallet with non-zero balance. Transfer or spend the balance first.")
        # Check for transactions
        txs = await self.transactions.find_by_user(user_id, wallet_id=wallet_id, limit=1)
        if txs:
            raise ValueError("Cannot delete wallet with transactions. Delete transactions first.")
        await wallet.delete()
        return {"success": True, "id": wallet_id, "message": "Wallet deleted"}

    # ─── Categories ─────────────────────────────────────────────────────────────

    async def list_categories(self, user_id: str) -> list[dict]:
        categories = await self.categories.find_by_user(user_id)
        return [_category_to_dict(c) for c in categories]

    async def get_category(self, category_id: str, user_id: str) -> dict | None:
        """Get a single category by ID."""
        category = await self.categories.find_by_id(category_id, user_id)
        return _category_to_dict(category) if category else None

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

    async def update_category(
        self,
        category_id: str,
        user_id: str,
        name: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        budget: float | None = None,
    ) -> dict:
        """Update a category's details."""
        category = await self.categories.find_by_id(category_id, user_id)
        if not category:
            raise ValueError("Category not found")
        if name is not None:
            category.name = name
        if icon is not None:
            category.icon = icon
        if color is not None:
            category.color = color
        if budget is not None:
            category.budget = budget
        await category.save()
        return _category_to_dict(category)

    async def delete_category(self, category_id: str, user_id: str) -> dict:
        """Delete a category if it has no transactions."""
        category = await self.categories.find_by_id(category_id, user_id)
        if not category:
            raise ValueError("Category not found")
        # Check for transactions using this category
        txs = await self.transactions.find_by_user(user_id, category_id=category_id, limit=1)
        if txs:
            raise ValueError("Cannot delete category with transactions. Delete or reassign transactions first.")
        await category.delete()
        return {"success": True, "id": category_id, "message": "Category deleted"}

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

    async def get_transaction(self, transaction_id: str, user_id: str) -> dict | None:
        """Get a single transaction by ID."""
        tx = await self.transactions.find_by_id(transaction_id, user_id)
        return _tx_to_dict(tx) if tx else None

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

    async def update_transaction(
        self,
        transaction_id: str,
        user_id: str,
        wallet_id: str | None = None,
        category_id: str | None = None,
        amount: float | None = None,
        date: datetime | None = None,
        note: str | None = None,
    ) -> dict:
        """Update a transaction and adjust wallet balances if needed."""
        tx = await self.transactions.find_by_id(transaction_id, user_id)
        if not tx:
            raise ValueError("Transaction not found")

        original_wallet = await self.wallets.find_by_id(str(tx.wallet_id), user_id)
        if not original_wallet:
            raise ValueError("Original wallet not found")

        # Calculate balance adjustments
        old_delta = tx.amount if tx.type == "income" else -tx.amount

        # Determine new values
        new_wallet_id = wallet_id if wallet_id else str(tx.wallet_id)
        new_amount = amount if amount is not None else tx.amount
        new_category_id = category_id if category_id else str(tx.category_id)

        if new_amount <= 0:
            raise ValueError("Amount must be positive")

        # Check if wallet changed
        wallet_changed = new_wallet_id != str(tx.wallet_id)

        if wallet_changed:
            # Revert old wallet balance
            await self.wallets.update_balance(original_wallet, -old_delta)

            # Apply to new wallet
            new_wallet = await self.wallets.find_by_id(new_wallet_id, user_id)
            if not new_wallet:
                # Revert if new wallet invalid
                await self.wallets.update_balance(original_wallet, old_delta)
                raise ValueError("New wallet not found")

            new_delta = new_amount if tx.type == "income" else -new_amount

            if tx.type == "expense" and new_wallet.balance < new_amount:
                # Revert old wallet if insufficient
                await self.wallets.update_balance(original_wallet, old_delta)
                raise ValueError("Insufficient balance in new wallet")

            await self.wallets.update_balance(new_wallet, new_delta)
        else:
            # Same wallet, just adjust for amount change
            if new_amount != tx.amount:
                delta_change = new_amount - tx.amount
                if tx.type == "expense":
                    delta_change = -delta_change

                # Check sufficient balance for expense increase
                if tx.type == "expense" and new_amount > tx.amount:
                    if original_wallet.balance < (new_amount - tx.amount):
                        raise ValueError("Insufficient balance for increased expense")

                await self.wallets.update_balance(original_wallet, delta_change)

        # Update transaction fields
        tx.wallet_id = new_wallet_id
        tx.category_id = new_category_id
        tx.amount = new_amount
        if date:
            tx.date = date
        if note is not None:
            tx.note = note

        await tx.save()
        return _tx_to_dict(tx)

    async def delete_transaction(self, transaction_id: str, user_id: str) -> dict:
        """Delete a transaction and reverse its effect on wallet balance."""
        tx = await self.transactions.find_by_id(transaction_id, user_id)
        if not tx:
            raise ValueError("Transaction not found")

        wallet = await self.wallets.find_by_id(str(tx.wallet_id), user_id)
        if wallet:
            # Reverse the transaction effect
            reverse_delta = -tx.amount if tx.type == "income" else tx.amount
            await self.wallets.update_balance(wallet, reverse_delta)

        await tx.delete()
        return {"success": True, "id": transaction_id, "message": "Transaction deleted"}

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

"""Finance plugin business logic — thin wrappers over repository."""

import asyncio
from datetime import UTC, date, datetime, timedelta

from beanie import PydanticObjectId
from pymongo.asynchronous.client_session import AsyncClientSession
from pymongo.errors import DuplicateKeyError

from apps.finance.enums import TransactionType
from apps.finance.models import Category, Transaction, Wallet
from apps.finance.repository import (
    CategoryRepository,
    TransactionRepository,
    WalletRepository,
    finance_transaction,
)
from core.models import User
from core.utils.timezone import ensure_naive_utc, get_user_timezone_context


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
        try:
            wallet = await self.wallets.create(user_id, name, currency)
        except DuplicateKeyError as exc:
            raise ValueError(_wallet_name_exists_message(name)) from exc
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
            try:
                wallet = await self.wallets.rename(wallet, name=name)
            except DuplicateKeyError as exc:
                raise ValueError(_wallet_name_exists_message(name)) from exc
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
        await self.wallets.delete(wallet)
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
        try:
            category = await self.categories.create(user_id, name, icon, color, budget)
        except DuplicateKeyError as exc:
            raise ValueError(_category_name_exists_message(name)) from exc
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
        try:
            category = await self.categories.update(
                category,
                name=name,
                icon=icon,
                color=color,
                budget=budget,
            )
        except DuplicateKeyError as exc:
            raise ValueError(_category_name_exists_message(name or category.name)) from exc
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
        await self.categories.delete(category)
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
            user_id,
            type_,
            category_id,
            wallet_id,
            skip=skip,
            limit=limit,
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
        type_: TransactionType,
        amount: float,
        occurred_at: datetime,
        note: str | None = None,
    ) -> dict:
        if amount <= 0:
            raise ValueError("Amount must be positive")
        async with finance_transaction() as session:
            wallet = await self.wallets.find_by_id(wallet_id, user_id, session=session)
            if not wallet:
                raise ValueError("Wallet not found")

            category = await self.categories.find_by_id(category_id, user_id, session=session)
            if not category:
                raise ValueError("Category not found")

            delta = amount if type_ == "income" else -amount
            await self._apply_wallet_delta_or_raise(
                wallet_id,
                user_id,
                delta,
                insufficient_message="Insufficient balance",
                session=session,
            )

            tx = await self.transactions.create(
                user_id,
                wallet_id,
                str(category.id),
                type_,
                amount,
                occurred_at,
                note,
                session=session,
            )

        return _tx_to_dict(tx)

    async def update_transaction(
        self,
        transaction_id: str,
        user_id: str,
        wallet_id: str | None = None,
        category_id: str | None = None,
        amount: float | None = None,
        occurred_at: datetime | None = None,
        note: str | None = None,
    ) -> dict:
        """Update a transaction and adjust wallet balances if needed."""
        async with finance_transaction() as session:
            tx = await self.transactions.find_by_id(transaction_id, user_id, session=session)
            if not tx:
                raise ValueError("Transaction not found")

            original_wallet = await self.wallets.find_by_id(
                str(tx.wallet_id),
                user_id,
                session=session,
            )
            if not original_wallet:
                raise ValueError("Original wallet not found")

            old_delta = tx.amount if tx.type == "income" else -tx.amount
            new_wallet_id = wallet_id if wallet_id else str(tx.wallet_id)
            new_amount = amount if amount is not None else tx.amount
            new_category_id = category_id if category_id else str(tx.category_id)

            if new_amount <= 0:
                raise ValueError("Amount must be positive")

            category = await self.categories.find_by_id(new_category_id, user_id, session=session)
            if not category:
                raise ValueError("Category not found")

            wallet_changed = new_wallet_id != str(tx.wallet_id)
            new_delta = new_amount if tx.type == "income" else -new_amount

            if wallet_changed:
                await self._apply_wallet_delta_or_raise(
                    str(tx.wallet_id),
                    user_id,
                    -old_delta,
                    insufficient_message="Insufficient balance in original wallet",
                    session=session,
                )

                new_wallet = await self.wallets.find_by_id(new_wallet_id, user_id, session=session)
                if not new_wallet:
                    raise ValueError("New wallet not found")

                await self._apply_wallet_delta_or_raise(
                    new_wallet_id,
                    user_id,
                    new_delta,
                    insufficient_message="Insufficient balance in new wallet",
                    session=session,
                )
            else:
                delta_change = new_delta - old_delta
                if delta_change != 0:
                    await self._apply_wallet_delta_or_raise(
                        str(tx.wallet_id),
                        user_id,
                        delta_change,
                        insufficient_message="Insufficient balance for this update",
                        session=session,
                    )

            tx.wallet_id = PydanticObjectId(new_wallet_id)
            tx.category_id = PydanticObjectId(str(category.id))
            tx.amount = new_amount
            if occurred_at is not None:
                tx.occurred_at = occurred_at
            if note is not None:
                tx.note = note

            await self.transactions.save(tx, session=session)
        return _tx_to_dict(tx)

    async def delete_transaction(self, transaction_id: str, user_id: str) -> dict:
        """Delete a transaction and reverse its effect on wallet balance."""
        async with finance_transaction() as session:
            tx = await self.transactions.find_by_id(transaction_id, user_id, session=session)
            if not tx:
                raise ValueError("Transaction not found")

            wallet = await self.wallets.find_by_id(str(tx.wallet_id), user_id, session=session)
            if not wallet:
                raise ValueError("Wallet not found")

            reverse_delta = -tx.amount if tx.type == "income" else tx.amount
            await self._apply_wallet_delta_or_raise(
                str(tx.wallet_id),
                user_id,
                reverse_delta,
                insufficient_message="Insufficient balance to delete this transaction",
                session=session,
            )

            await self.transactions.delete(tx, session=session)
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
        async with finance_transaction() as session:
            src = await self.wallets.find_by_id(from_wallet_id, user_id, session=session)
            if not src:
                raise ValueError("Source wallet not found")

            dst = await self.wallets.find_by_id(to_wallet_id, user_id, session=session)
            if not dst:
                raise ValueError("Destination wallet not found")

            updated_src = await self._apply_wallet_delta_or_raise(
                from_wallet_id,
                user_id,
                -amount,
                insufficient_message="Insufficient balance",
                session=session,
            )
            updated_dst = await self._apply_wallet_delta_or_raise(
                to_wallet_id,
                user_id,
                amount,
                insufficient_message="Destination wallet could not be updated",
                session=session,
            )

            transfer_cat_entry = await self.categories.find_by_name(
                user_id,
                "Internal Transfer",
                session=session,
            )
            if not transfer_cat_entry:
                try:
                    transfer_cat_entry = await self.categories.create(
                        user_id,
                        "Internal Transfer",
                        "ArrowLeftRight",
                        "oklch(0.65 0.21 280)",
                        0.0,
                        session=session,
                    )
                except DuplicateKeyError:
                    transfer_cat_entry = await self.categories.find_by_name(
                        user_id,
                        "Internal Transfer",
                        session=session,
                    )
            if not transfer_cat_entry:
                raise ValueError("Transfer category could not be resolved")

            now = datetime.now(UTC)
            note_str = f": {note}" if note else ""
            await self.transactions.create(
                user_id,
                from_wallet_id,
                str(transfer_cat_entry.id),
                "expense",
                amount,
                now,
                f"Transfer to {dst.name}{note_str}",
                session=session,
            )
            await self.transactions.create(
                user_id,
                to_wallet_id,
                str(transfer_cat_entry.id),
                "income",
                amount,
                now,
                f"Transfer from {src.name}{note_str}",
                session=session,
            )

        return {
            "from_wallet": _wallet_to_dict(updated_src),
            "to_wallet": _wallet_to_dict(updated_dst),
            "amount": amount,
            "note": note,
        }

    async def _apply_wallet_delta_or_raise(
        self,
        wallet_id: str,
        user_id: str,
        delta: float,
        *,
        insufficient_message: str,
        session: AsyncClientSession,
    ) -> Wallet:
        min_balance = abs(delta) if delta < 0 else None
        updated_wallet = await self.wallets.apply_balance_delta(
            wallet_id,
            user_id,
            delta,
            min_balance=min_balance,
            session=session,
        )
        if updated_wallet is None:
            raise ValueError(insufficient_message)
        return updated_wallet

    # ─── Summary ────────────────────────────────────────────────────────────────

    async def get_summary(self, user: User) -> dict:
        user_id = str(user.id)
        wallets = await self.wallets.find_by_user(user_id)
        total_balance = sum(w.balance for w in wallets)

        # Use user timezone for "this month" calculations
        ctx = get_user_timezone_context(user)
        start_of_month, _ = ctx.month_range()

        # Filter transactions at DB level by date range
        start_naive = ensure_naive_utc(start_of_month)
        txs = await self.transactions.find_by_user(
            user_id, start_date=start_naive, skip=0, limit=10000
        )

        income = sum(t.amount for t in txs if t.type == "income")
        expense = sum(t.amount for t in txs if t.type == "expense")

        return {
            "total_balance": total_balance,
            "income_this_month": income,
            "expense_this_month": expense,
            "transaction_count": len(txs),
            "wallet_count": len(wallets),
        }

    # ─── Budget Monitoring ──────────────────────────────────────────────────────

    async def check_budget(self, user: User, category_id: str | None = None) -> dict:
        """Check spending vs budget for categories."""
        user_id = str(user.id)
        ctx = get_user_timezone_context(user)
        start_of_month, _ = ctx.month_range()

        # Run independent queries concurrently with DB-level date filtering
        start_naive = ensure_naive_utc(start_of_month)
        categories, txs = await asyncio.gather(
            self.categories.find_by_user(user_id),
            self.transactions.find_by_user(
                user_id, type_="expense", start_date=start_naive, skip=0, limit=10000
            )
        )

        # If specific category requested
        if category_id:
            cat = await self.categories.find_by_id(category_id, user_id)
            if not cat:
                raise ValueError("Category not found")

            spent = sum(t.amount for t in txs if str(t.category_id) == category_id)
            budget = cat.budget
            remaining = budget - spent if budget > 0 else None
            percentage = (spent / budget * 100) if budget > 0 else None

            return {
                "category_id": category_id,
                "category_name": cat.name,
                "budget": budget,
                "spent": round(spent, 2),
                "remaining": round(remaining, 2) if remaining is not None else None,
                "percentage_used": round(percentage, 1) if percentage is not None else None,
                "over_budget": spent > budget if budget > 0 else False,
            }

        # All categories overview
        results = []
        total_budget = 0
        total_spent = 0

        for cat in categories:
            cat_spent = sum(t.amount for t in txs if str(t.category_id) == str(cat.id))
            total_budget += cat.budget
            total_spent += cat_spent

            if cat.budget > 0:
                results.append({
                    "category_id": str(cat.id),
                    "category_name": cat.name,
                    "budget": cat.budget,
                    "spent": round(cat_spent, 2),
                    "remaining": round(cat.budget - cat_spent, 2),
                    "percentage_used": round(cat_spent / cat.budget * 100, 1),
                    "over_budget": cat_spent > cat.budget,
                })

        # Get current month/year from user timezone
        now_local = ctx.now_local()

        return {
            "categories": results,
            "total_budget": total_budget,
            "total_spent": round(total_spent, 2),
            "month": now_local.month,
            "year": now_local.year,
        }

    # ─── Transaction Search ─────────────────────────────────────────────────────

    async def search_transactions(
        self,
        user_id: str,
        query: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search transactions by keyword or date range."""
        user = await User.get(user_id)
        ctx = get_user_timezone_context(user)

        start_utc = None
        if start_date is not None:
            start_utc = datetime.combine(start_date, datetime.min.time(), tzinfo=ctx.tz).astimezone(UTC)

        end_utc = None
        if end_date is not None:
            end_utc = datetime.combine(end_date, datetime.max.time(), tzinfo=ctx.tz).astimezone(UTC)

        # Use DB-level date filtering, only load what we need
        txs = await self.transactions.find_by_user(
            user_id, start_date=start_utc, end_date=end_utc, skip=0, limit=10000
        )

        # Filter by keyword in note (can't do text search in DB easily)
        if query:
            query_lower = query.lower()
            txs = [
                t for t in txs
                if (t.note and query_lower in t.note.lower())
                or query_lower in str(t.amount)
                or query_lower in t.type
            ]

        return [_tx_to_dict(t) for t in txs[:limit]]

    # ─── Statistics & Analytics ───────────────────────────────────────────────────

    async def get_category_breakdown(self, user_id: str, month: int | None = None, year: int | None = None) -> dict:
        """Get spending breakdown by category for a specific month.

        Month/year are interpreted in the user's local timezone.
        When not provided, defaults to the current month in the user's timezone.
        """
        user = await User.get(user_id)
        ctx = get_user_timezone_context(user)

        if month is not None and year is not None:
            # User specified month/year — interpret as their local month
            target_month = month
            target_year = year
        else:
            # Default to current month in user's local timezone
            now_local = ctx.now_local()
            target_month = now_local.month
            target_year = now_local.year

        # Build local start/end of the month, then convert to UTC for DB queries
        start_local = datetime(target_year, target_month, 1, tzinfo=ctx.tz)
        if target_month == 12:
            end_local = datetime(target_year + 1, 1, 1, tzinfo=ctx.tz) - timedelta(seconds=1)
        else:
            end_local = datetime(target_year, target_month + 1, 1, tzinfo=ctx.tz) - timedelta(seconds=1)

        # Use DB-level date filtering and run queries concurrently
        txs, categories = await asyncio.gather(
            self.transactions.find_by_user(
                user_id, type_="expense", start_date=start_local, end_date=end_local, skip=0, limit=10000
            ),
            self.categories.find_by_user(user_id)
        )

        cat_map = {str(c.id): c.name for c in categories}

        # Aggregate by category
        breakdown = {}
        total = 0
        for t in txs:
            cat_name = cat_map.get(str(t.category_id), "Uncategorized")
            breakdown[cat_name] = breakdown.get(cat_name, 0) + t.amount
            total += t.amount

        # Sort by amount descending
        sorted_breakdown = sorted(
            [{"category": k, "amount": round(v, 2), "percentage": round(v/total*100, 1) if total > 0 else 0}
             for k, v in breakdown.items()],
            key=lambda x: x["amount"],
            reverse=True
        )

        return {
            "month": target_month,
            "year": target_year,
            "total_spending": round(total, 2),
            "breakdown": sorted_breakdown,
            "category_count": len(breakdown),
        }

    async def get_monthly_trend(self, user_id: str, months: int = 6) -> dict:
        """Get income/expense trend over recent months using MongoDB aggregation."""
        from beanie import PydanticObjectId as _Oid

        pipeline = [
            {"$match": {"user_id": _Oid(user_id)}},
            {"$group": {
                "_id": {"year": {"$year": "$occurred_at"}, "month": {"$month": "$occurred_at"}, "type": "$type"},
                "total": {"$sum": "$amount"},
            }},
            {"$sort": {"_id.year": -1, "_id.month": -1}},
        ]
        results = await Transaction.aggregate(pipeline).to_list()

        # Merge income/expense per month
        monthly_data: dict[tuple[int, int], dict[str, float]] = {}
        for r in results:
            key = (r["_id"]["year"], r["_id"]["month"])
            if key not in monthly_data:
                monthly_data[key] = {"income": 0.0, "expense": 0.0}
            monthly_data[key][r["_id"]["type"]] += r["total"]

        # Get last N months
        sorted_months = sorted(monthly_data.keys(), reverse=True)[:months]
        trend = []
        for year, month in sorted_months:
            data = monthly_data[(year, month)]
            trend.append({
                "year": year,
                "month": month,
                "income": round(data["income"], 2),
                "expense": round(data["expense"], 2),
                "net": round(data["income"] - data["expense"], 2),
            })

        # Calculate averages
        if trend:
            avg_income = sum(m["income"] for m in trend) / len(trend)
            avg_expense = sum(m["expense"] for m in trend) / len(trend)
        else:
            avg_income = avg_expense = 0

        return {
            "trend": trend,
            "average_income": round(avg_income, 2),
            "average_expense": round(avg_expense, 2),
            "average_net": round(avg_income - avg_expense, 2),
        }

    # ─── Install / Uninstall hooks ──────────────────────────────────────────────

    async def on_install(self, user_id: str, session: AsyncClientSession | None = None) -> None:
        """Seed default data for a new user."""
        if session is None:
            async with finance_transaction() as tx_session:
                await self.on_install(user_id, session=tx_session)
            return

        if await self.wallets.count_by_user(user_id, session=session) == 0:
            try:
                await self.wallets.create(
                    user_id,
                    "Main Wallet",
                    "USD",
                    session=session,
                )
            except DuplicateKeyError:
                pass

        for name in ["Food", "Transport", "Entertainment", "Shopping", "Salary"]:
            try:
                await self.categories.create(user_id, name, session=session)
            except DuplicateKeyError:
                continue

    async def on_uninstall(self, user_id: str, session: AsyncClientSession | None = None) -> None:
        if session is None:
            async with finance_transaction() as tx_session:
                await self.on_uninstall(user_id, session=tx_session)
            return

        await self.wallets.delete_all_by_user(user_id, session=session)
        await self.categories.delete_all_by_user(user_id, session=session)
        await self.transactions.delete_all_by_user(user_id, session=session)


# ─── DTO helpers ───────────────────────────────────────────────────────────────

def _wallet_name_exists_message(name: str) -> str:
    return f"Wallet '{name}' already exists"


def _category_name_exists_message(name: str) -> str:
    return f"Category '{name}' already exists"


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
        "occurred_at": t.occurred_at.isoformat(),
        "note": t.note,
        "created_at": t.created_at.isoformat(),
    }


# Singleton
finance_service = FinanceService()

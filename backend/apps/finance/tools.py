"""Finance plugin LangGraph tools (LLM-facing)."""

from datetime import datetime
from typing import Literal

from langchain_core.tools import tool

from apps.finance.service import finance_service
from shared.agent_context import get_user_context


# ─── Tools ────────────────────────────────────────────────────────────────────

@tool
async def finance_add_transaction(
    wallet_id: str,
    category_id: str,
    type_: Literal["income", "expense"],
    amount: float,
    date: str,
    note: str | None = None,
) -> dict:
    """Add a new income or expense transaction."""
    user_id = get_user_context()
    dt = datetime.fromisoformat(date) if date else datetime.utcnow()
    return await finance_service.add_transaction(
        user_id, wallet_id, category_id, type_, amount, dt, note
    )


@tool
async def finance_list_wallets() -> list[dict]:
    """List all wallets of the current user."""
    user_id = get_user_context()
    return await finance_service.list_wallets(user_id)


@tool
async def finance_create_wallet(name: str, currency: str = "USD") -> dict:
    """Create a new wallet for the current user."""
    user_id = get_user_context()
    return await finance_service.create_wallet(user_id, name, currency)


@tool
async def finance_list_categories() -> list[dict]:
    """List all categories of the current user."""
    user_id = get_user_context()
    return await finance_service.list_categories(user_id)


@tool
async def finance_list_transactions(
    type_: str | None = None,
    wallet_id: str | None = None,
    category_id: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """List transactions, optionally filtered."""
    user_id = get_user_context()
    return await finance_service.list_transactions(
        user_id, type_, category_id, wallet_id, limit=limit
    )

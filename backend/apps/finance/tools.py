"""Finance plugin LangGraph tools (LLM-facing)."""

from datetime import datetime
from typing import Literal

from langchain_core.tools import tool

from apps.finance.service import finance_service
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call

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
    async def operation() -> dict:
        user_id = get_user_context()
        dt = datetime.fromisoformat(date) if date else datetime.utcnow()
        return await finance_service.add_transaction(
            user_id, wallet_id, category_id, type_, amount, dt, note
        )

    return await safe_tool_call(operation, action="adding a finance transaction")


@tool
async def finance_list_wallets() -> list[dict]:
    """List all wallets of the current user."""
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await finance_service.list_wallets(user_id)

    return await safe_tool_call(operation, action="listing wallets")


@tool
async def finance_create_wallet(name: str, currency: str = "USD") -> dict:
    """Create a new wallet for the current user."""
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.create_wallet(user_id, name, currency)

    return await safe_tool_call(operation, action="creating a wallet")


@tool
async def finance_list_categories() -> list[dict]:
    """List all categories of the current user."""
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await finance_service.list_categories(user_id)

    return await safe_tool_call(operation, action="listing categories")


@tool
async def finance_list_transactions(
    type_: str | None = None,
    wallet_id: str | None = None,
    category_id: str | None = None,
    limit: int = 20,
) -> dict:
    """List transactions, optionally filtered."""
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await finance_service.list_transactions(
            user_id, type_, category_id, wallet_id, limit=limit
        )

    return await safe_tool_call(operation, action="listing transactions")

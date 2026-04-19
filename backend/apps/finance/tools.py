"""Finance plugin LangGraph tools (LLM-facing)."""

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from apps.finance.enums import TransactionType
from apps.finance.service import finance_service
from core.models import User
from shared.tool_results import run_time_aware_tool_with_user, run_tool_with_user


@tool("finance_list_wallets")
async def finance_list_wallets(config: RunnableConfig) -> list[dict]:
    """List wallets for the current user."""
    return await run_tool_with_user(
        config,
        action="listing wallets",
        operation=lambda user_id: finance_service.list_wallets(user_id),
    )


@tool("finance_get_wallet")
async def finance_get_wallet(wallet_id: str, config: RunnableConfig) -> dict:
    """Get one wallet by id."""
    async def operation(user_id: str) -> dict:
        wallet = await finance_service.get_wallet(wallet_id, user_id)
        if not wallet:
            raise ValueError(f"Wallet '{wallet_id}' not found")
        return wallet

    return await run_tool_with_user(
        config,
        action="getting a wallet",
        operation=operation,
    )


@tool("finance_create_wallet")
async def finance_create_wallet(
    name: str,
    config: RunnableConfig,
    currency: str = "USD",
) -> dict:
    """Create a wallet."""
    return await run_tool_with_user(
        config,
        action="creating a wallet",
        operation=lambda user_id: finance_service.create_wallet(user_id, name, currency),
    )


@tool("finance_update_wallet")
async def finance_update_wallet(
    wallet_id: str,
    config: RunnableConfig,
    name: str | None = None,
) -> dict:
    """Update wallet metadata."""
    return await run_tool_with_user(
        config,
        action="updating a wallet",
        operation=lambda user_id: finance_service.update_wallet(wallet_id, user_id, name),
    )


@tool("finance_delete_wallet")
async def finance_delete_wallet(wallet_id: str, config: RunnableConfig) -> dict:
    """Delete an empty wallet."""
    return await run_tool_with_user(
        config,
        action="deleting a wallet",
        operation=lambda user_id: finance_service.delete_wallet(wallet_id, user_id),
    )


@tool("finance_list_categories")
async def finance_list_categories(config: RunnableConfig) -> list[dict]:
    """List categories for the current user."""
    return await run_tool_with_user(
        config,
        action="listing categories",
        operation=lambda user_id: finance_service.list_categories(user_id),
    )


@tool("finance_get_category")
async def finance_get_category(category_id: str, config: RunnableConfig) -> dict:
    """Get one category by id."""
    async def operation(user_id: str) -> dict:
        category = await finance_service.get_category(category_id, user_id)
        if not category:
            raise ValueError(f"Category '{category_id}' not found")
        return category

    return await run_tool_with_user(
        config,
        action="getting a category",
        operation=operation,
    )


@tool("finance_create_category")
async def finance_create_category(
    name: str,
    config: RunnableConfig,
    icon: str = "Tag",
    color: str = "oklch(0.65 0.21 280)",
    budget: float = 0.0,
) -> dict:
    """Create a category."""
    return await run_tool_with_user(
        config,
        action="creating a category",
        operation=lambda user_id: finance_service.create_category(user_id, name, icon, color, budget),
    )


@tool("finance_update_category")
async def finance_update_category(
    category_id: str,
    config: RunnableConfig,
    name: str | None = None,
    icon: str | None = None,
    color: str | None = None,
    budget: float | None = None,
) -> dict:
    """Update category metadata."""
    return await run_tool_with_user(
        config,
        action="updating a category",
        operation=lambda user_id: finance_service.update_category(category_id, user_id, name, icon, color, budget),
    )


@tool("finance_delete_category")
async def finance_delete_category(category_id: str, config: RunnableConfig) -> dict:
    """Delete a category with no transactions."""
    return await run_tool_with_user(
        config,
        action="deleting a category",
        operation=lambda user_id: finance_service.delete_category(category_id, user_id),
    )


@tool("finance_list_transactions")
async def finance_list_transactions(
    config: RunnableConfig,
    type_: TransactionType | None = None,
    wallet_id: str | None = None,
    category_id: str | None = None,
    limit: int = 20,
) -> dict:
    """List transactions with filters."""
    return await run_tool_with_user(
        config,
        action="listing transactions",
        operation=lambda user_id: finance_service.list_transactions(
            user_id, type_, category_id, wallet_id, 0, limit
        ),
    )


@tool("finance_get_transaction")
async def finance_get_transaction(transaction_id: str, config: RunnableConfig) -> dict:
    """Get one transaction by id."""
    async def operation(user_id: str) -> dict:
        tx = await finance_service.get_transaction(transaction_id, user_id)
        if not tx:
            raise ValueError(f"Transaction '{transaction_id}' not found")
        return tx

    return await run_tool_with_user(
        config,
        action="getting a transaction",
        operation=operation,
    )


@tool("finance_add_transaction")
async def finance_add_transaction(
    wallet_id: str,
    category_id: str,
    type_: TransactionType,
    amount: float,
    date: str,
    config: RunnableConfig,
    note: str | None = None,
) -> dict:
    """Create a new transaction."""
    async def operation(user_id: str, temporal: dict, _time_context) -> dict:
        return await finance_service.add_transaction(
            user_id,
            wallet_id,
            category_id,
            type_,
            amount,
            temporal["date"],
            note,
        )

    return await run_time_aware_tool_with_user(
        config,
        action="adding a transaction",
        payload={"date": date},
        temporal_fields={"date": "local_datetime"},
        operation=operation,
    )


@tool("finance_update_transaction")
async def finance_update_transaction(
    transaction_id: str,
    config: RunnableConfig,
    wallet_id: str | None = None,
    category_id: str | None = None,
    amount: float | None = None,
    date: str | None = None,
    note: str | None = None,
) -> dict:
    """Update an existing transaction."""
    async def operation(user_id: str, temporal: dict, _time_context) -> dict:
        return await finance_service.update_transaction(
            transaction_id,
            user_id,
            wallet_id,
            category_id,
            amount,
            temporal.get("date"),
            note,
        )

    return await run_time_aware_tool_with_user(
        config,
        action="updating a transaction",
        payload={"date": date},
        temporal_fields={"date": "local_datetime"},
        operation=operation,
    )


@tool("finance_delete_transaction")
async def finance_delete_transaction(transaction_id: str, config: RunnableConfig) -> dict:
    """Delete a transaction."""
    return await run_tool_with_user(
        config,
        action="deleting a transaction",
        operation=lambda user_id: finance_service.delete_transaction(transaction_id, user_id),
    )


@tool("finance_transfer")
async def finance_transfer(
    from_wallet_id: str,
    to_wallet_id: str,
    amount: float,
    config: RunnableConfig,
    note: str | None = None,
) -> dict:
    """Transfer funds between wallets."""
    return await run_tool_with_user(
        config,
        action="transferring funds",
        operation=lambda user_id: finance_service.transfer(user_id, from_wallet_id, to_wallet_id, amount, note),
    )


@tool("finance_get_summary")
async def finance_get_summary(config: RunnableConfig) -> dict:
    """Get finance summary metrics."""
    async def operation(user_id: str) -> dict:
        user = await User.get(user_id)
        if user is None:
            raise ValueError("User not found")
        return await finance_service.get_summary(user)

    return await run_tool_with_user(
        config,
        action="getting financial summary",
        operation=operation,
    )


@tool("finance_check_budget")
async def finance_check_budget(
    config: RunnableConfig,
    category_id: str | None = None,
) -> dict:
    """Check budget usage."""
    async def operation(user_id: str) -> dict:
        user = await User.get(user_id)
        if user is None:
            raise ValueError("User not found")
        return await finance_service.check_budget(user, category_id)

    return await run_tool_with_user(
        config,
        action="checking budget",
        operation=operation,
    )


@tool("finance_search_transactions")
async def finance_search_transactions(
    config: RunnableConfig,
    query: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Search transactions by text/date."""
    async def operation(user_id: str, temporal: dict, time_context) -> list[dict]:
        start_dt = None
        if temporal.get("start_date") is not None:
            start_dt, _ = time_context.local_date_range_utc(temporal["start_date"])

        end_dt = None
        if temporal.get("end_date") is not None:
            _, end_dt = time_context.local_date_range_utc(temporal["end_date"])

        return await finance_service.search_transactions(
            user_id,
            query,
            start_dt,
            end_dt,
            limit,
        )

    return await run_time_aware_tool_with_user(
        config,
        action="searching transactions",
        payload={"start_date": start_date, "end_date": end_date},
        temporal_fields={"start_date": "local_date", "end_date": "local_date"},
        operation=operation,
    )


@tool("finance_get_category_breakdown")
async def finance_get_category_breakdown(
    config: RunnableConfig,
    month: int | None = None,
    year: int | None = None,
) -> dict:
    """Get expense breakdown by category."""
    return await run_tool_with_user(
        config,
        action="getting category breakdown",
        operation=lambda user_id: finance_service.get_category_breakdown(user_id, month, year),
    )


@tool("finance_get_monthly_trend")
async def finance_get_monthly_trend(
    config: RunnableConfig,
    months: int = 6,
) -> dict:
    """Get monthly income/expense trend."""
    capped_months = min(months, 12)
    return await run_tool_with_user(
        config,
        action="getting monthly trend",
        operation=lambda user_id: finance_service.get_monthly_trend(user_id, capped_months),
    )

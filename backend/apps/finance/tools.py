"""Finance plugin LangGraph tools (LLM-facing)."""

from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from apps.finance.enums import TransactionType
from apps.finance.schemas import (
    FinanceActionResponse,
    FinanceActivitySummaryResponse,
    FinanceBudgetCheckResponse,
    FinanceCategoryBreakdownResponse,
    FinanceCategoryRead,
    FinanceMonthlyTrendResponse,
    FinanceSummaryResponse,
    FinanceTransactionRead,
    FinanceTransferResponse,
    FinanceWalletRead,
)
from apps.finance.service import finance_service
from core.agents.runtime_context import AppAgentContext
from core.models import User
from shared.tool_results import (
    run_time_aware_tool_with_runtime,
    run_tool_with_runtime,
)
from shared.tool_time import ToolTimeContext

FinanceToolResult = (
    FinanceActionResponse
    | FinanceActivitySummaryResponse
    | FinanceBudgetCheckResponse
    | FinanceCategoryBreakdownResponse
    | FinanceCategoryRead
    | FinanceMonthlyTrendResponse
    | FinanceSummaryResponse
    | FinanceTransactionRead
    | FinanceTransferResponse
    | FinanceWalletRead
    | list[FinanceCategoryRead]
    | list[FinanceTransactionRead]
    | list[FinanceWalletRead]
)


@tool("finance_list_wallets")
async def finance_list_wallets(*, runtime: ToolRuntime[AppAgentContext]) -> FinanceToolResult:
    """
    List the user's wallets.

    Use when:
    - User asks which wallets/accounts they have
    - Need wallet ids before creating transfers or transactions

    Args:
    - none

    Returns:
    - wallets with id, name, currency, and balance

    Limitations:
    - Returns current wallet state only, not wallet history or audit events
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.list_wallets(user_id),
    )


@tool("finance_get_wallet")
async def finance_get_wallet(
    wallet_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Get one wallet by id.

    Use when:
    - A wallet id is already known and you need its details
    - Verifying wallet state before an update or deletion

    Args:
    - wallet_id: Wallet identifier to fetch

    Returns:
    - the requested wallet

    Limitations:
    - Fails if the wallet does not exist for the current user
    """
    async def operation(user_id: str) -> FinanceWalletRead:
        wallet = await finance_service.get_wallet(wallet_id, user_id)
        if not wallet:
            raise ValueError(f"Wallet '{wallet_id}' not found")
        return wallet

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("finance_create_wallet")
async def finance_create_wallet(
    name: str,
    currency: str = "USD",
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Create a new wallet.

    Use when:
    - User wants a new account, wallet, or balance bucket

    Args:
    - name: Wallet display name
    - currency: ISO-like currency code, default "USD"

    Returns:
    - created wallet

    Limitations:
    - Does not infer opening balance from the request; new wallets start empty
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.create_wallet(user_id, name, currency),
    )


@tool("finance_update_wallet")
async def finance_update_wallet(
    wallet_id: str,
    name: str | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Rename an existing wallet.

    Use when:
    - User wants to rename a wallet

    Args:
    - wallet_id: Wallet identifier to update
    - name: New wallet name

    Returns:
    - updated wallet

    Limitations:
    - This tool only renames wallets; it does not change currency or balance
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.update_wallet(wallet_id, user_id, name),
    )


@tool("finance_delete_wallet")
async def finance_delete_wallet(
    wallet_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Delete an empty wallet.

    Use when:
    - User explicitly wants to remove a wallet permanently

    Args:
    - wallet_id: Wallet identifier to delete

    Returns:
    - success confirmation

    Limitations:
    - Fails if the wallet still has balance or transactions
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.delete_wallet(wallet_id, user_id),
    )


@tool("finance_list_categories")
async def finance_list_categories(*, runtime: ToolRuntime[AppAgentContext]) -> FinanceToolResult:
    """
    List the user's categories.

    Use when:
    - User asks which spending/income categories exist
    - Need category ids before creating or editing transactions

    Args:
    - none

    Returns:
    - categories with id, name, icon, color, and budget

    Limitations:
    - Returns current category definitions only, not category change history
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.list_categories(user_id),
    )


@tool("finance_get_category")
async def finance_get_category(
    category_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Get one category by id.

    Use when:
    - A category id is already known and you need its details

    Args:
    - category_id: Category identifier to fetch

    Returns:
    - the requested category

    Limitations:
    - Fails if the category does not exist for the current user
    """
    async def operation(user_id: str) -> FinanceCategoryRead:
        category = await finance_service.get_category(category_id, user_id)
        if not category:
            raise ValueError(f"Category '{category_id}' not found")
        return category

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("finance_create_category")
async def finance_create_category(
    name: str,
    icon: str = "Tag",
    color: str = "oklch(0.65 0.21 280)",
    budget: float = 0.0,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Create a new finance category.

    Use when:
    - User wants a new expense or income category

    Args:
    - name: Category display name
    - icon: Visual icon name for the category
    - color: Display color for the category
    - budget: Optional budget target for the category

    Returns:
    - created category

    Limitations:
    - Creates metadata only; it does not backfill or recategorize old transactions
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.create_category(user_id, name, icon, color, budget),
    )


@tool("finance_update_category")
async def finance_update_category(
    category_id: str,
    name: str | None = None,
    icon: str | None = None,
    color: str | None = None,
    budget: float | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Update category metadata such as name, icon, color, or budget.

    Use when:
    - User wants to rename a category
    - User wants to change a category budget or presentation

    Args:
    - category_id: Category identifier to update
    - name/icon/color/budget: Fields to patch

    Returns:
    - updated category

    Limitations:
    - Updates category metadata only; it does not change existing transaction amounts or types
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.update_category(category_id, user_id, name, icon, color, budget),
    )


@tool("finance_delete_category")
async def finance_delete_category(
    category_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Delete a category that has no transactions.

    Use when:
    - User explicitly wants to remove an unused category

    Args:
    - category_id: Category identifier to delete

    Returns:
    - success confirmation

    Limitations:
    - Fails if transactions still reference the category
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.delete_category(category_id, user_id),
    )


@tool("finance_list_transactions")
async def finance_list_transactions(
    type_: TransactionType | None = None,
    wallet_id: str | None = None,
    category_id: str | None = None,
    limit: int = 20,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    List transactions, optionally filtered by type, wallet, or category.

    Use when:
    - User wants a recent ledger view
    - Need current transactions for a wallet or category
    - User asks for income-only or expense-only lists

    Args:
    - type_: Optional transaction type filter
    - wallet_id: Optional wallet filter
    - category_id: Optional category filter
    - limit: Maximum number of transactions to return

    Returns:
    - matching transactions

    Limitations:
    - Prefer finance_search_transactions for keyword queries or explicit date ranges.
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.list_transactions(
            user_id, type_, category_id, wallet_id, 0, limit
        ),
    )


@tool("finance_get_transaction")
async def finance_get_transaction(
    transaction_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Get one transaction by id.

    Use when:
    - A transaction id is already known and you need full details

    Args:
    - transaction_id: Transaction identifier to fetch

    Returns:
    - the requested transaction

    Limitations:
    - Fails if the transaction does not exist for the current user
    """
    async def operation(user_id: str) -> FinanceTransactionRead:
        tx = await finance_service.get_transaction(transaction_id, user_id)
        if not tx:
            raise ValueError(f"Transaction '{transaction_id}' not found")
        return tx

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("finance_add_transaction")
async def finance_add_transaction(
    wallet_id: str,
    category_id: str,
    type_: TransactionType,
    amount: float,
    occurred_at: str,
    note: str | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Create a new transaction.

    Use when:
    - User records income or an expense

    Args:
    - wallet_id: Wallet that should receive or fund the transaction
    - category_id: Category to attach to the transaction
    - type_: Whether the transaction is income or expense
    - amount: Positive monetary amount
    - occurred_at: Local wall-clock datetime in the user's timezone
    - note: Optional free-text note

    Returns:
    - created transaction

    Limitations:
    - Requires explicit wallet and category ids; this tool does not infer them from fuzzy names
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> FinanceTransactionRead:
        return await finance_service.add_transaction(
            user_id,
            wallet_id,
            category_id,
            type_,
            amount,
            temporal["occurred_at"],
            note,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"occurred_at": occurred_at},
        temporal_fields={"occurred_at": "local_datetime"},
        operation=operation,
    )


@tool("finance_update_transaction")
async def finance_update_transaction(
    transaction_id: str,
    wallet_id: str | None = None,
    category_id: str | None = None,
    amount: float | None = None,
    occurred_at: str | None = None,
    note: str | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Update an existing transaction.

    Use when:
    - User corrects the wallet, category, amount, time, or note of a transaction

    Args:
    - transaction_id: Transaction identifier to update
    - wallet_id/category_id/amount/occurred_at/note: Fields to patch

    Returns:
    - updated transaction

    Limitations:
    - Does not change the transaction type; corrections are limited to the exposed fields
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> FinanceTransactionRead:
        return await finance_service.update_transaction(
            transaction_id,
            user_id,
            wallet_id,
            category_id,
            amount,
            temporal.get("occurred_at"),
            note,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"occurred_at": occurred_at},
        temporal_fields={"occurred_at": "local_datetime"},
        operation=operation,
    )


@tool("finance_delete_transaction")
async def finance_delete_transaction(
    transaction_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Delete a transaction permanently.

    Use when:
    - User explicitly wants to remove a mistaken transaction

    Args:
    - transaction_id: Transaction identifier to delete

    Returns:
    - success confirmation

    Limitations:
    - Deletes permanently; there is no archive or restore flow
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.delete_transaction(transaction_id, user_id),
    )


@tool("finance_transfer")
async def finance_transfer(
    from_wallet_id: str,
    to_wallet_id: str,
    amount: float,
    note: str | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Transfer funds between two wallets.

    Use when:
    - User moves money between their own wallets

    Args:
    - from_wallet_id: Source wallet
    - to_wallet_id: Destination wallet
    - amount: Positive transfer amount
    - note: Optional transfer note

    Returns:
    - transfer result with affected wallets and amounts

    Limitations:
    - Only supports transfers between the user's own wallets
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.transfer(user_id, from_wallet_id, to_wallet_id, amount, note),
    )


@tool("finance_get_summary")
async def finance_get_summary(*, runtime: ToolRuntime[AppAgentContext]) -> FinanceToolResult:
    """
    Get current high-level finance summary metrics.

    Use when:
    - User wants a balance snapshot or overall finance overview
    - Need current totals, not a history recap

    Args:
    - none

    Returns:
    - current balances, totals, and summary metrics

    Limitations:
    - Prefer finance_summarize_activity for "what changed" questions.
    """
    async def operation(user_id: str) -> FinanceSummaryResponse:
        user = await User.get(user_id)
        if not isinstance(user, User):
            raise ValueError("User not found")
        return await finance_service.get_summary(user)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("finance_summarize_activity")
async def finance_summarize_activity(
    start: str,
    end: str,
    limit: int = 10,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Summarize finance records created within a local time window.

    Use when:
    - User asks what changed in finance today/this week
    - Need newly recorded transactions, wallets, or categories
    - Building a workspace recap

    Args:
    - start: Local window start datetime
    - end: Local window end datetime
    - limit: Maximum number of sample records to return per section

    Returns:
    - transactions recorded in the range
    - wallets/categories created in the range
    - income/expense totals for newly recorded transactions
    - explicit unsupported history dimensions

    Limitations:
    - Wallet/category edits, budget changes, and transaction delete history are not tracked.
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> FinanceActivitySummaryResponse:
        return await finance_service.summarize_activity(
            user_id,
            temporal["start"],
            temporal["end"],
            limit=limit,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"start": start, "end": end},
        temporal_fields={"start": "local_datetime", "end": "local_datetime"},
        operation=operation,
    )


@tool("finance_check_budget")
async def finance_check_budget(
    category_id: str | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Check budget usage overall or for one category.

    Use when:
    - User asks whether they are over budget
    - Need budget context before logging an expense

    Args:
    - category_id: Optional category identifier to scope the check

    Returns:
    - budget status and category-level usage

    Limitations:
    - Reflects current budget state; it is not a historical budget audit
    """
    async def operation(user_id: str) -> FinanceBudgetCheckResponse:
        user = await User.get(user_id)
        if not isinstance(user, User):
            raise ValueError("User not found")
        return await finance_service.check_budget(user, category_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("finance_search_transactions")
async def finance_search_transactions(
    query: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 20,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Search transactions by keyword and/or local date range.

    Use when:
    - User asks for transactions matching a note or keyword
    - User asks for transactions during a date window

    Args:
    - query: Optional keyword search over transaction text fields
    - start_date/end_date: Local calendar dates in the user's timezone
    - limit: Maximum number of transactions to return

    Returns:
    - matching transactions

    Limitations:
    - Searches current transaction records only; it does not expose deleted transaction history
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        time_context: ToolTimeContext,
    ) -> list[FinanceTransactionRead]:
        return await finance_service.search_transactions(
            user_id,
            query,
            temporal.get("start_date"),
            temporal.get("end_date"),
            limit,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"start_date": start_date, "end_date": end_date},
        temporal_fields={"start_date": "local_date", "end_date": "local_date"},
        operation=operation,
    )


@tool("finance_get_category_breakdown")
async def finance_get_category_breakdown(
    month: int | None = None,
    year: int | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Get the current month's expense breakdown by category.

    Use when:
    - User asks where money is going by category
    - Need category percentages or totals for a month

    Args:
    - month: Optional month override
    - year: Optional year override

    Returns:
    - per-category spending breakdown

    Limitations:
    - Focuses on expense breakdown; it is not a full transaction ledger
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.get_category_breakdown(user_id, month, year),
    )


@tool("finance_get_monthly_trend")
async def finance_get_monthly_trend(
    months: int = 6,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> FinanceToolResult:
    """
    Get monthly income and expense trends over recent months.

    Use when:
    - User asks about spending trends over time
    - Need month-over-month finance analytics

    Args:
    - months: Number of recent months to include, capped internally

    Returns:
    - monthly income and expense series

    Limitations:
    - Returns aggregated monthly trends, not raw transaction-level detail
    """
    capped_months = min(months, 12)
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: finance_service.get_monthly_trend(user_id, capped_months),
    )

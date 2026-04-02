"""Finance plugin LangGraph tools (LLM-facing)."""

from datetime import datetime
from typing import Literal

from langchain_core.tools import tool

from apps.finance.service import finance_service
from shared.agent_context import get_user_context
from shared.confirmation import requires_confirmation
from shared.tool_results import safe_tool_call

# ─── Tools ────────────────────────────────────────────────────────────────────

# ─── Wallets ───────────────────────────────────────────────────────────────────

@tool
async def finance_list_wallets() -> list[dict]:
    """
    List all wallets of the current user.

    Use when:
    - User asks about their wallets or accounts
    - Need wallet context for transactions
    - User wants to see balances

    Returns:
        List of wallets with id, name, currency, balance

    Examples:
        - "Show my wallets"
        - "What accounts do I have?"
        - "How much money do I have?"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await finance_service.list_wallets(user_id)

    return await safe_tool_call(operation, action="listing wallets")


@tool
async def finance_get_wallet(wallet_id: str) -> dict:
    """
    Get a single wallet by ID.

    Use when:
    - User asks about a specific wallet
    - Need wallet details before transfer
    - Verifying wallet balance

    Args:
        wallet_id: The wallet's unique identifier

    Returns:
        Wallet details: id, name, currency, balance, created_at

    Errors:
        NOT_FOUND: Wallet ID does not exist
    """
    async def operation() -> dict:
        user_id = get_user_context()
        wallet = await finance_service.get_wallet(wallet_id, user_id)
        if not wallet:
            raise ValueError(f"Wallet '{wallet_id}' not found")
        return wallet

    return await safe_tool_call(operation, action="getting a wallet")


@tool
async def finance_create_wallet(name: str, currency: str = "USD") -> dict:
    """
    Create a new wallet for the current user.

    Use when:
    - User asks to create a new wallet or account
    - Setting up a new budget category as a wallet

    Args:
        name: Wallet name (e.g., "Cash", "Bank Account", "Savings")
        currency: 3-letter currency code (default: "USD")

    Returns:
        Created wallet with starting balance of 0

    Examples:
        - "Create a new wallet called Cash"
        - "Add a savings account"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.create_wallet(user_id, name, currency)

    return await safe_tool_call(operation, action="creating a wallet")


@tool
async def finance_update_wallet(wallet_id: str, name: str | None = None) -> dict:
    """
    Update a wallet's name.

    Use when:
    - User wants to rename a wallet
    - Correcting wallet name

    Args:
        wallet_id: Wallet to update
        name: New name for the wallet

    Returns:
        Updated wallet details

    Errors:
        NOT_FOUND: Wallet ID does not exist
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.update_wallet(wallet_id, user_id, name)

    return await safe_tool_call(operation, action="updating a wallet")


@tool
@requires_confirmation(
    title="Delete Wallet",
    description="Permanently delete wallet '{wallet_id}'",
    risk_level="high",
)
async def finance_delete_wallet(
    wallet_id: str,
    _confirmation_id: str | None = None,
) -> dict:
    """
    Delete a wallet permanently.

    Use when:
    - User asks to remove a wallet
    - User wants to delete an empty account

    Args:
        wallet_id: Wallet to delete
        _confirmation_id: UI confirmation ID (automatically provided by frontend)

    Returns:
        Success confirmation

    Errors:
        NOT_FOUND: Wallet ID does not exist
        HAS_BALANCE: Cannot delete wallet with non-zero balance
        HAS_TRANSACTIONS: Cannot delete wallet with transactions

    Warning: This action cannot be undone. Wallet must be empty.
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.delete_wallet(wallet_id, user_id)

    return await safe_tool_call(operation, action="deleting a wallet")


# ─── Categories ────────────────────────────────────────────────────────────────

@tool
async def finance_list_categories() -> list[dict]:
    """
    List all categories of the current user.

    Use when:
    - User asks about spending categories
    - Need category context for transactions
    - Setting up budget categories

    Returns:
        List of categories with id, name, icon, color, budget

    Examples:
        - "Show my categories"
        - "What spending categories do I have?"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await finance_service.list_categories(user_id)

    return await safe_tool_call(operation, action="listing categories")


@tool
async def finance_get_category(category_id: str) -> dict:
    """
    Get a single category by ID.

    Use when:
    - User asks about a specific category
    - Need category details for budget planning

    Args:
        category_id: The category's unique identifier

    Returns:
        Category details: id, name, icon, color, budget

    Errors:
        NOT_FOUND: Category ID does not exist
    """
    async def operation() -> dict:
        user_id = get_user_context()
        category = await finance_service.get_category(category_id, user_id)
        if not category:
            raise ValueError(f"Category '{category_id}' not found")
        return category

    return await safe_tool_call(operation, action="getting a category")


@tool
async def finance_create_category(
    name: str,
    icon: str = "Tag",
    color: str = "oklch(0.65 0.21 280)",
    budget: float = 0.0,
) -> dict:
    """
    Create a new spending/income category.

    Use when:
    - User wants to add a new budget category
    - Creating custom spending tracking

    Args:
        name: Category name (e.g., "Food", "Transport", "Entertainment")
        icon: Icon name for UI (default: "Tag")
        color: Color code for UI (default: purple)
        budget: Monthly budget limit, 0 means no limit (default: 0)

    Returns:
        Created category

    Examples:
        - "Create a category for dining out"
        - "Add a new category called Gym with $50 budget"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.create_category(user_id, name, icon, color, budget)

    return await safe_tool_call(operation, action="creating a category")


@tool
async def finance_update_category(
    category_id: str,
    name: str | None = None,
    icon: str | None = None,
    color: str | None = None,
    budget: float | None = None,
) -> dict:
    """
    Update a category's details.

    Use when:
    - User wants to rename a category
    - Changing category budget
    - Updating icon or color

    Args:
        category_id: Category to update
        name: New name (optional)
        icon: New icon (optional)
        color: New color (optional)
        budget: New budget limit (optional)

    Returns:
        Updated category details

    Errors:
        NOT_FOUND: Category ID does not exist
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.update_category(
            category_id, user_id, name, icon, color, budget
        )

    return await safe_tool_call(operation, action="updating a category")


@tool
async def finance_delete_category(category_id: str) -> dict:
    """
    Delete a category permanently.

    Use when:
    - User asks to remove a category
    - Cleaning up unused categories

    Args:
        category_id: Category to delete

    Returns:
        Success confirmation

    Errors:
        NOT_FOUND: Category ID does not exist
        HAS_TRANSACTIONS: Cannot delete category with transactions

    Warning: This action cannot be undone. Category must have no transactions.
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.delete_category(category_id, user_id)

    return await safe_tool_call(operation, action="deleting a category")


# ─── Transactions ──────────────────────────────────────────────────────────────

@tool
async def finance_list_transactions(
    type_: Literal["income", "expense"] | None = None,
    wallet_id: str | None = None,
    category_id: str | None = None,
    limit: int = 20,
) -> dict:
    """
    List transactions with optional filtering.

    Use when:
    - User asks to see transactions
    - Looking for specific income or expenses
    - Reviewing spending by category

    Args:
        type_: Filter by "income" or "expense", None for all
        wallet_id: Filter by specific wallet, None for all
        category_id: Filter by specific category, None for all
        limit: Max transactions to return (default 20)

    Returns:
        List of transactions with id, wallet_id, category_id, type, amount, date, note

    Examples:
        - "Show my recent expenses" → type_="expense"
        - "What did I spend on food?" → category_id="food_cat_id"
        - "Transactions from my cash wallet" → wallet_id="cash_wallet_id"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await finance_service.list_transactions(
            user_id, type_, category_id, wallet_id, 0, limit
        )

    return await safe_tool_call(operation, action="listing transactions")


@tool
async def finance_get_transaction(transaction_id: str) -> dict:
    """
    Get a single transaction by ID.

    Use when:
    - User asks about a specific transaction
    - Need transaction details for review

    Args:
        transaction_id: The transaction's unique identifier

    Returns:
        Transaction details

    Errors:
        NOT_FOUND: Transaction ID does not exist
    """
    async def operation() -> dict:
        user_id = get_user_context()
        tx = await finance_service.get_transaction(transaction_id, user_id)
        if not tx:
            raise ValueError(f"Transaction '{transaction_id}' not found")
        return tx

    return await safe_tool_call(operation, action="getting a transaction")


@tool
async def finance_add_transaction(
    wallet_id: str,
    category_id: str,
    type_: Literal["income", "expense"],
    amount: float,
    date: str,
    note: str | None = None,
) -> dict:
    """
    Add a new income or expense transaction.

    Use when:
    - User records income or spending
    - Adding a transaction manually

    IMPORTANT - For expense transactions:
    - Before adding, consider using finance_check_budget to see current budget status
    - This allows warning the user if they're about to exceed their budget
    - After adding, you can check budget again to show remaining amount

    Args:
        wallet_id: Which wallet/account
        category_id: Spending/income category
        type_: "income" or "expense"
        amount: Positive number (required)
        date: ISO format date string
        note: Optional description

    Returns:
        Created transaction

    Errors:
        INSUFFICIENT_BALANCE: Wallet doesn't have enough for expense
        WALLET_NOT_FOUND: Wallet ID invalid
        CATEGORY_NOT_FOUND: Category ID invalid

    Examples:
        - "I spent $50 on food" → amount=50, type_="expense", category="Food"
          (Consider checking food budget first with finance_check_budget)
        - "Got $1000 salary" → amount=1000, type_="income", category="Salary"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        dt = datetime.fromisoformat(date) if date else datetime.utcnow()
        return await finance_service.add_transaction(
            user_id, wallet_id, category_id, type_, amount, dt, note
        )

    return await safe_tool_call(operation, action="adding a transaction")


@tool
async def finance_update_transaction(
    transaction_id: str,
    wallet_id: str | None = None,
    category_id: str | None = None,
    amount: float | None = None,
    date: str | None = None,
    note: str | None = None,
) -> dict:
    """
    Update an existing transaction.

    Use when:
    - User needs to correct a transaction
    - Changing amount, date, or category

    Args:
        transaction_id: Transaction to update
        wallet_id: New wallet (optional)
        category_id: New category (optional)
        amount: New amount (optional, must be positive)
        date: New date ISO format (optional)
        note: New note (optional)

    Returns:
        Updated transaction

    Errors:
        NOT_FOUND: Transaction ID does not exist
        INSUFFICIENT_BALANCE: New amount exceeds wallet balance

    Note: Changing amount may affect wallet balance accordingly.
    """
    async def operation() -> dict:
        user_id = get_user_context()
        dt = datetime.fromisoformat(date) if date else None
        return await finance_service.update_transaction(
            transaction_id, user_id, wallet_id, category_id, amount, dt, note
        )

    return await safe_tool_call(operation, action="updating a transaction")


@tool
@requires_confirmation(
    title="Delete Transaction",
    description="Permanently delete transaction '{transaction_id}'. "
                "This will reverse the transaction's effect on wallet balance.",
    risk_level="medium",
)
async def finance_delete_transaction(
    transaction_id: str,
    _confirmation_id: str | None = None,
) -> dict:
    """
    Delete a transaction permanently.

    Use when:
    - User wants to remove a transaction
    - Correcting a duplicate entry

    Args:
        transaction_id: Transaction to delete
        _confirmation_id: UI confirmation ID (automatically provided by frontend)

    Returns:
        Success confirmation

    Errors:
        NOT_FOUND: Transaction ID does not exist

    Note: This will reverse the transaction's effect on wallet balance.
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.delete_transaction(transaction_id, user_id)

    return await safe_tool_call(operation, action="deleting a transaction")


# ─── Transfer ──────────────────────────────────────────────────────────────────

@tool
@requires_confirmation(
    title="Transfer Funds",
    description="Transfer {amount} from '{from_wallet_id}' to '{to_wallet_id}'",
    risk_level="high",
)
async def finance_transfer(
    from_wallet_id: str,
    to_wallet_id: str,
    amount: float,
    note: str | None = None,
    _confirmation_id: str | None = None,
) -> dict:
    """
    Transfer money between two wallets.

    Use when:
    - User moves money between accounts
    - Transferring funds internally

    Args:
        from_wallet_id: Source wallet
        to_wallet_id: Destination wallet
        amount: Amount to transfer (must be positive)
        note: Optional transfer reason
        _confirmation_id: UI confirmation ID (automatically provided by frontend)

    Returns:
        Transfer details with updated wallet balances

    Errors:
        SAME_WALLET: Source and destination cannot be the same
        INSUFFICIENT_BALANCE: Source wallet doesn't have enough
        WALLET_NOT_FOUND: Either wallet ID invalid

    Examples:
        - "Transfer $100 from Cash to Bank"
        - "Move 50 from Savings to Checking"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.transfer(
            user_id, from_wallet_id, to_wallet_id, amount, note
        )

    return await safe_tool_call(operation, action="transferring funds")


# ─── Summary ───────────────────────────────────────────────────────────────────

@tool
async def finance_get_summary() -> dict:
    """
    Get a financial summary for the current user.

    Use when:
    - User asks for financial overview
    - User wants spending report
    - "How am I doing financially?"

    Returns:
        Summary with:
        - total_balance: Sum of all wallet balances
        - income_this_month: Total income in current month
        - expense_this_month: Total expenses in current month
        - transaction_count: Number of transactions
        - wallet_count: Number of wallets

    Examples:
        - "Show my financial summary"
        - "How much did I spend this month?"
        - "What's my net worth?"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.get_summary(user_id)

    return await safe_tool_call(operation, action="getting financial summary")


# ─── Budget Monitoring ─────────────────────────────────────────────────────────

@tool
async def finance_check_budget(category_id: str | None = None) -> dict:
    """
    Check spending vs budget for categories.

    Use when:
    - User asks about their budget status
    - "Am I over budget on food?"
    - "How much can I still spend on entertainment?"
    - Want to see all budget categories overview

    Args:
        category_id: Specific category to check (optional).
                     If not provided, returns all categories with budgets.

    Returns:
        For single category:
        - budget, spent, remaining, percentage_used, over_budget flag
        For all categories:
        - List of categories with budgets, total_budget, total_spent

    Examples:
        - "Check my food budget" → category_id="food_cat_id"
        - "How am I doing with budgets?" → no category_id
        - "Did I exceed my entertainment budget?"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.check_budget(user_id, category_id)

    return await safe_tool_call(operation, action="checking budget")


# ─── Transaction Search ────────────────────────────────────────────────────────

@tool
async def finance_search_transactions(
    query: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """
    Search transactions by keyword or date range.

    Use when:
    - User wants to find specific transactions
    - Searching by description/note
    - Looking for transactions in a date range
    - "Find my coffee purchases"

    Args:
        query: Search term to look for in notes/descriptions
        start_date: Start date in ISO format (e.g., "2025-01-01")
        end_date: End date in ISO format (e.g., "2025-01-31")
        limit: Maximum results (default 20)

    Returns:
        List of matching transactions

    Examples:
        - "Find transactions with coffee" → query="coffee"
        - "Show me last week's expenses" → start_date="2025-03-25", end_date="2025-04-01"
        - "Search for salary in January" → query="salary", start_date="2025-01-01", end_date="2025-01-31"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        return await finance_service.search_transactions(
            user_id, query, start_dt, end_dt, limit
        )

    return await safe_tool_call(operation, action="searching transactions")


# ─── Statistics & Analytics ────────────────────────────────────────────────────

@tool
async def finance_get_category_breakdown(
    month: int | None = None,
    year: int | None = None,
) -> dict:
    """
    Get spending breakdown by category for a specific month.

    Use when:
    - User wants to see where money went
    - "What did I spend the most on?"
    - Analyzing spending patterns by category

    Args:
        month: Month number (1-12), defaults to current month
        year: Year, defaults to current year

    Returns:
        - Total spending for the month
        - Breakdown by category with amounts and percentages
        - Categories sorted by spending (highest first)

    Examples:
        - "What did I spend on in March?" → month=3
        - "Show my spending breakdown" → current month
        - "Category spending last month" → month=previous
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await finance_service.get_category_breakdown(user_id, month, year)

    return await safe_tool_call(operation, action="getting category breakdown")


@tool
async def finance_get_monthly_trend(months: int = 6) -> dict:
    """
    Get income and expense trend over recent months.

    Use when:
    - User wants to see financial trends over time
    - "Am I spending more each month?"
    - "How has my income changed?"
    - Financial health check over time

    Args:
        months: Number of months to look back (default 6, max 12)

    Returns:
        - Monthly trend with income, expense, net for each month
        - Averages over the period
        - Sorted from most recent

    Examples:
        - "Show my spending trend" → months=6
        - "How have I been doing the last 3 months?" → months=3
        - "Yearly trend" → months=12
    """
    async def operation() -> dict:
        user_id = get_user_context()
        capped_months = min(months, 12)  # Cap at 12 months
        return await finance_service.get_monthly_trend(user_id, capped_months)

    return await safe_tool_call(operation, action="getting monthly trend")

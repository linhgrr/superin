"""Finance plugin FastAPI routes — thin layer calling finance_service."""

from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from apps.finance.schemas import (
    BudgetOverviewWidgetConfig,
    BudgetOverviewWidgetData,
    FinanceActionResponse,
    FinanceBudgetCheckResponse,
    FinanceCategoryBreakdownResponse,
    FinanceCategoryRead,
    FinanceCreateCategoryRequest,
    FinanceCreateTransactionRequest,
    FinanceCreateWalletRequest,
    FinanceMonthlyTrendResponse,
    FinanceSummaryResponse,
    FinanceTransactionRead,
    FinanceTransferRequest,
    FinanceTransferResponse,
    FinanceUpdateCategoryRequest,
    FinanceUpdateTransactionRequest,
    FinanceUpdateWalletRequest,
    FinanceWalletRead,
    FinanceWidgetDataResponse,
    RecentTransactionsWidgetConfig,
    RecentTransactionsWidgetData,
    TotalBalanceWidgetConfig,
    TotalBalanceWidgetData,
)
from apps.finance.service import finance_service
from core.auth.dependencies import get_current_user
from core.models import User
from core.registry import WIDGET_DATA_HANDLERS
from core.widget_config import resolve_widget_config, upsert_widget_config
from shared.preference_utils import (
    preference_to_schema,
    update_multiple_preferences,
)
from shared.schemas import (
    ConfigFieldSchema,
    PreferenceUpdate,
    SelectOption,
    WidgetDataConfigSchema,
    WidgetDataConfigUpdate,
    WidgetManifestSchema,
    WidgetPreferenceSchema,
)

router = APIRouter()


def _get_widget_manifest(widget_id: str) -> WidgetManifestSchema:
    from apps.finance.manifest import finance_manifest

    for widget in finance_manifest.widgets:
        if widget.id == widget_id:
            return widget
    raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' not found")


async def _resolve_widget_options(
    user_id: str,
    widget: WidgetManifestSchema,
) -> list[ConfigFieldSchema]:
    fields: list[ConfigFieldSchema] = []
    wallet_options: list[SelectOption] | None = None

    for field in widget.config_fields:
        next_field = field.model_copy(deep=True)
        if next_field.options_source == "finance.wallets":
            if wallet_options is None:
                wallets = await finance_service.list_wallets(user_id)
                wallet_options = [
                    SelectOption(label=wallet["name"], value=wallet["id"])
                    for wallet in wallets
                ]
            next_field.options = wallet_options
        fields.append(next_field)
    return fields


async def get_total_balance_widget_data(
    user_id: str,
    config: TotalBalanceWidgetConfig,
) -> TotalBalanceWidgetData:
    wallets = await finance_service.list_wallets(user_id)
    if config.account_id:
        wallet = next((item for item in wallets if item["id"] == config.account_id), None)
        if wallet is None:
            raise HTTPException(status_code=404, detail="Configured wallet not found")
        return TotalBalanceWidgetData(
            total_balance=wallet["balance"],
            wallet_name=wallet["name"],
            currency=wallet["currency"],
            wallet_count=1,
        )

    currency = wallets[0]["currency"] if wallets else None
    return TotalBalanceWidgetData(
        total_balance=sum(wallet["balance"] for wallet in wallets),
        wallet_name=None,
        currency=currency,
        wallet_count=len(wallets),
    )


async def get_budget_overview_widget_data(
    user_id: str,
    config: BudgetOverviewWidgetConfig,
) -> BudgetOverviewWidgetData:
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    budget = await finance_service.check_budget(user, None)
    categories = budget.get("categories", [])
    if not config.include_categories_without_budget:
        categories = [item for item in categories if item.get("budget", 0) > 0]

    total_budget = sum(item.get("budget", 0) for item in categories)
    total_spent = sum(item.get("spent", 0) for item in categories)
    remaining_budget = total_budget - total_spent if total_budget > 0 else None
    over_budget_count = sum(1 for item in categories if item.get("over_budget"))
    return BudgetOverviewWidgetData(
        total_budget=round(total_budget, 2),
        total_spent=round(total_spent, 2),
        remaining_budget=round(remaining_budget, 2) if remaining_budget is not None else None,
        category_count=len(categories),
        over_budget_count=over_budget_count,
        month=budget["month"],
        year=budget["year"],
    )


async def get_recent_transactions_widget_data(
    user_id: str,
    config: RecentTransactionsWidgetConfig,
) -> RecentTransactionsWidgetData:
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    summary = await finance_service.get_summary(user)
    items = await finance_service.list_transactions(
        user_id,
        None,
        None,
        config.wallet_id,
        0,
        config.limit,
    )
    return RecentTransactionsWidgetData(
        items=items,
        income_this_month=summary["income_this_month"],
        expense_this_month=summary["expense_this_month"],
        scope="single-wallet" if config.wallet_id else "all-wallets",
    )


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets", response_model=list[WidgetManifestSchema])
async def list_widgets() -> list[WidgetManifestSchema]:
    from apps.finance.manifest import finance_manifest
    return finance_manifest.widgets


@router.get("/widgets/{widget_id}", response_model=FinanceWidgetDataResponse)
async def get_widget_data(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> FinanceWidgetDataResponse:
    _get_widget_manifest(widget_id)
    handler = WIDGET_DATA_HANDLERS.get(widget_id)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' is not registered")
    config = await resolve_widget_config(user_id, widget_id)
    return await handler(user_id, config)


@router.put("/widgets/{widget_id}/config", response_model=WidgetDataConfigSchema)
async def update_widget_config(
    widget_id: str,
    update: WidgetDataConfigUpdate,
    user_id: str = Depends(get_current_user),
) -> WidgetDataConfigSchema:
    _get_widget_manifest(widget_id)
    if update.widget_id != widget_id:
        raise HTTPException(status_code=400, detail="Payload widget_id must match path widget_id")

    doc = await upsert_widget_config(user_id, widget_id, update.config)
    return WidgetDataConfigSchema(
        id=str(doc.id),
        user_id=str(doc.user_id),
        widget_id=doc.widget_id,
        config=doc.config,
    )


@router.get("/widgets/{widget_id}/options", response_model=list[ConfigFieldSchema])
async def get_widget_options(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> list[ConfigFieldSchema]:
    widget = _get_widget_manifest(widget_id)
    return await _resolve_widget_options(user_id, widget)


# ─── Wallets ─────────────────────────────────────────────────────────────────

@router.get("/wallets", response_model=list[FinanceWalletRead])
async def list_wallets(user_id: str = Depends(get_current_user)):
    return await finance_service.list_wallets(user_id)


@router.get("/wallets/{wallet_id}", response_model=FinanceWalletRead)
async def get_wallet(
    wallet_id: str,
    user_id: str = Depends(get_current_user),
):
    wallet = await finance_service.get_wallet(wallet_id, user_id)
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


@router.post("/wallets", response_model=FinanceWalletRead)
async def create_wallet(
    request: FinanceCreateWalletRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await finance_service.create_wallet(user_id, request.name, request.currency)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/wallets/{wallet_id}", response_model=FinanceWalletRead)
async def update_wallet(
    wallet_id: str,
    request: FinanceUpdateWalletRequest,
    user_id: str = Depends(get_current_user),
):
    """Update wallet name."""
    try:
        return await finance_service.update_wallet(wallet_id, user_id, request.name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/wallets/{wallet_id}", response_model=FinanceActionResponse)
async def delete_wallet(
    wallet_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a wallet if empty."""
    try:
        return await finance_service.delete_wallet(wallet_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[FinanceCategoryRead])
async def list_categories(user_id: str = Depends(get_current_user)):
    return await finance_service.list_categories(user_id)


@router.get("/categories/{category_id}", response_model=FinanceCategoryRead)
async def get_category(
    category_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get a single category by ID."""
    category = await finance_service.get_category(category_id, user_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.post("/categories", response_model=FinanceCategoryRead)
async def create_category(
    request: FinanceCreateCategoryRequest,
    user_id: str = Depends(get_current_user),
):
    return await finance_service.create_category(
        user_id,
        request.name,
        request.icon,
        request.color,
        request.budget,
    )


@router.patch("/categories/{category_id}", response_model=FinanceCategoryRead)
async def update_category(
    category_id: str,
    request: FinanceUpdateCategoryRequest,
    user_id: str = Depends(get_current_user),
):
    """Update a category."""
    try:
        return await finance_service.update_category(
            category_id, user_id,
            request.name, request.icon, request.color, request.budget
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/categories/{category_id}", response_model=FinanceActionResponse)
async def delete_category(
    category_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a category if it has no transactions."""
    try:
        return await finance_service.delete_category(category_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Transactions ──────────────────────────────────────────────────────────────

@router.get("/transactions", response_model=list[FinanceTransactionRead])
async def list_transactions(
    user_id: str = Depends(get_current_user),
    type_: str | None = Query(None, alias="type"),
    category_id: str | None = None,
    wallet_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=100),
):
    return await finance_service.list_transactions(
        user_id, type_, category_id, wallet_id, skip, limit
    )


@router.get("/transactions/{transaction_id}", response_model=FinanceTransactionRead)
async def get_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get a single transaction by ID."""
    tx = await finance_service.get_transaction(transaction_id, user_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


@router.post("/transactions", response_model=FinanceTransactionRead)
async def create_transaction(
    request: FinanceCreateTransactionRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await finance_service.add_transaction(
            user_id,
            str(request.wallet_id),
            str(request.category_id),
            request.type,
            request.amount,
            request.date,
            request.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/transactions/{transaction_id}", response_model=FinanceTransactionRead)
async def update_transaction(
    transaction_id: str,
    request: FinanceUpdateTransactionRequest,
    user_id: str = Depends(get_current_user),
):
    """Update a transaction."""
    try:
        return await finance_service.update_transaction(
            transaction_id, user_id,
            str(request.wallet_id) if request.wallet_id else None,
            str(request.category_id) if request.category_id else None,
            request.amount,
            request.date,
            request.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/transactions/{transaction_id}", response_model=FinanceActionResponse)
async def delete_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a transaction and reverse its effect on wallet balance."""
    try:
        return await finance_service.delete_transaction(transaction_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Search ────────────────────────────────────────────────────────────────────

@router.get("/transactions/search", response_model=list[FinanceTransactionRead])
async def search_transactions(
    query: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = Query(20, le=100),
    user_id: str = Depends(get_current_user),
):
    """Search transactions by keyword or date range."""
    return await finance_service.search_transactions(user_id, query, start_date, end_date, limit)


# ─── Budget & Analytics ─────────────────────────────────────────────────────────

@router.get("/budget/check", response_model=FinanceBudgetCheckResponse)
async def check_budget(
    category_id: str | None = None,
    user_id: str = Depends(get_current_user),
):
    """Check spending vs budget for categories."""
    try:
        # Fetch user to pass to service for timezone-aware calculations
        user = await User.get(user_id)
        return await finance_service.check_budget(user, category_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/analytics/category-breakdown", response_model=FinanceCategoryBreakdownResponse)
async def get_category_breakdown(
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2020, le=2100),
    user_id: str = Depends(get_current_user),
):
    """Get spending breakdown by category."""
    return await finance_service.get_category_breakdown(user_id, month, year)


@router.get("/analytics/monthly-trend", response_model=FinanceMonthlyTrendResponse)
async def get_monthly_trend(
    months: int = Query(6, ge=1, le=12),
    user_id: str = Depends(get_current_user),
):
    """Get income/expense trend over recent months."""
    return await finance_service.get_monthly_trend(user_id, months)


# ─── Preferences (required by platform) ─────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:

    from core.models import WidgetPreference
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "finance",
    ).to_list()
    return [preference_to_schema(p) for p in prefs]


@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    await update_multiple_preferences(user_id, updates, "finance")
    return await get_preferences(user_id)


# ─── Transfer ────────────────────────────────────────────────────────────────────


@router.post("/transfer", response_model=FinanceTransferResponse)
async def transfer_funds(
    request: FinanceTransferRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await finance_service.transfer(
            user_id,
            str(request.from_wallet_id),
            str(request.to_wallet_id),
            request.amount,
            request.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Summary ────────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=FinanceSummaryResponse)
async def finance_summary(user_id: str = Depends(get_current_user)):
    # Fetch user to pass to service for timezone-aware calculations
    user = await User.get(user_id)
    return await finance_service.get_summary(user)

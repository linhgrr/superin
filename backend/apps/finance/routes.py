"""Finance plugin FastAPI routes — thin layer calling finance_service."""


from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from apps.finance.schemas import (
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
)
from apps.finance.service import finance_service
from core.auth import get_current_user
from core.models import User
from shared.preference_utils import (
    preference_to_schema,
    update_multiple_preferences,
)
from shared.schemas import PreferenceUpdate, WidgetManifestSchema, WidgetPreferenceSchema

router = APIRouter()


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets", response_model=list[WidgetManifestSchema])
async def list_widgets() -> list[WidgetManifestSchema]:
    from apps.finance.manifest import finance_manifest
    return finance_manifest.widgets


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
    from beanie import PydanticObjectId

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

"""Finance plugin FastAPI routes — thin layer calling finance_service."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from core.auth import get_current_user
from apps.finance.service import finance_service
from apps.finance.schemas import (
    CreateWalletRequest,
    CreateCategoryRequest,
    CreateTransactionRequest,
    TransferRequest,
)
from shared.schemas import WidgetPreferenceSchema, PreferenceUpdate

router = APIRouter()


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets")
async def list_widgets():
    from apps.finance.manifest import finance_manifest
    return finance_manifest.widgets


# ─── Wallets ─────────────────────────────────────────────────────────────────

@router.get("/wallets")
async def list_wallets(user_id: str = Depends(get_current_user)):
    return await finance_service.list_wallets(user_id)


@router.post("/wallets")
async def create_wallet(
    request: CreateWalletRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await finance_service.create_wallet(user_id, request.name, request.currency)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wallets/{wallet_id}")
async def get_wallet(
    wallet_id: str,
    user_id: str = Depends(get_current_user),
):
    wallet = await finance_service.get_wallet(wallet_id, user_id)
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


# ─── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories")
async def list_categories(user_id: str = Depends(get_current_user)):
    return await finance_service.list_categories(user_id)


@router.post("/categories")
async def create_category(
    request: CreateCategoryRequest,
    user_id: str = Depends(get_current_user),
):
    return await finance_service.create_category(
        user_id,
        request.name,
        request.icon,
        request.color,
        request.budget,
    )


# ─── Transactions ──────────────────────────────────────────────────────────────

@router.get("/transactions")
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


@router.post("/transactions")
async def create_transaction(
    request: CreateTransactionRequest,
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


# ─── Preferences (required by platform) ─────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    from core.models import WidgetPreference
    from beanie import PydanticObjectId
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "finance",
    ).to_list()
    return [
        WidgetPreferenceSchema(
            id=str(p.id),
            user_id=str(p.user_id),
            widget_id=p.widget_id,
            app_id=p.app_id,
            enabled=p.enabled,
            position=p.position,
            config=p.config,
        )
        for p in prefs
    ]


@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    from core.models import WidgetPreference
    from beanie import PydanticObjectId
    for u in updates:
        pref = await WidgetPreference.find_one(
            WidgetPreference.user_id == PydanticObjectId(user_id),
            WidgetPreference.app_id == "finance",
            WidgetPreference.widget_id == u.widget_id,
        )
        if pref:
            if u.enabled is not None:
                pref.enabled = u.enabled
            if u.position is not None:
                pref.position = u.position
            if u.config is not None:
                pref.config = u.config
            await pref.save()
    return await get_preferences(user_id)


# ─── Transfer ────────────────────────────────────────────────────────────────────


@router.post("/transfer")
async def transfer_funds(
    request: TransferRequest,
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

@router.get("/summary")
async def finance_summary(user_id: str = Depends(get_current_user)):
    return await finance_service.get_summary(user_id)

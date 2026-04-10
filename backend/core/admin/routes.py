"""Admin routes — platform-level management endpoints."""

from fastapi import APIRouter, Depends, Query

from core.auth.dependencies import get_current_admin_user
from shared.enums import SubscriptionStatus, SubscriptionTier

from .schemas import (
    AdminAppRead,
    AdminAppsResponse,
    AdminStatsRead,
    AdminSubscriptionRead,
    AdminSubscriptionsResponse,
    AdminUpdateAppTierRequest,
    AdminUpdateSubscriptionRequest,
    AdminUpdateUserRoleRequest,
    AdminUserRead,
    AdminUsersResponse,
)
from .service import (
    get_stats,
    list_apps,
    list_subscriptions,
    list_users,
    update_app_requires_tier,
    update_subscription,
    update_user_role,
)

router = APIRouter()


@router.get("/stats", response_model=AdminStatsRead)
async def get_admin_stats(
    _admin_user_id: str = Depends(get_current_admin_user),
) -> AdminStatsRead:
    return await get_stats()


@router.get("/users", response_model=AdminUsersResponse)
async def get_admin_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None),
    _admin_user_id: str = Depends(get_current_admin_user),
) -> AdminUsersResponse:
    return await list_users(skip=skip, limit=limit, search=search)


@router.patch("/users/{user_id}/role", response_model=AdminUserRead)
async def patch_admin_user_role(
    user_id: str,
    request: AdminUpdateUserRoleRequest,
    _admin_user_id: str = Depends(get_current_admin_user),
) -> AdminUserRead:
    return await update_user_role(user_id=user_id, role=request.role)


@router.get("/subscriptions", response_model=AdminSubscriptionsResponse)
async def get_admin_subscriptions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    status: SubscriptionStatus | None = Query(default=None),
    tier: SubscriptionTier | None = Query(default=None),
    _admin_user_id: str = Depends(get_current_admin_user),
) -> AdminSubscriptionsResponse:
    return await list_subscriptions(skip=skip, limit=limit, status=status, tier=tier)


@router.patch("/subscriptions/{user_id}", response_model=AdminSubscriptionRead)
async def patch_admin_subscription(
    user_id: str,
    request: AdminUpdateSubscriptionRequest,
    _admin_user_id: str = Depends(get_current_admin_user),
) -> AdminSubscriptionRead:
    return await update_subscription(user_id=user_id, request=request)


@router.get("/apps", response_model=AdminAppsResponse)
async def get_admin_apps(
    _admin_user_id: str = Depends(get_current_admin_user),
) -> AdminAppsResponse:
    return await list_apps()


@router.patch("/apps/{app_id}/tier", response_model=AdminAppRead)
async def patch_admin_app_tier(
    app_id: str,
    request: AdminUpdateAppTierRequest,
    _admin_user_id: str = Depends(get_current_admin_user),
) -> AdminAppRead:
    return await update_app_requires_tier(app_id=app_id, requires_tier=request.requires_tier)


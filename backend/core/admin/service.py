"""Admin service — platform-level user/subscription/app management."""

from __future__ import annotations

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import HTTPException

from core.models import User, UserAppInstallation
from core.registry import PLUGIN_REGISTRY, get_plugin
from core.subscriptions.model import Subscription
from core.utils.timezone import utc_now
from shared.enums import (
    InstallationStatus,
    SubscriptionStatus,
    SubscriptionTier,
    UserRole,
)

from .schemas import (
    AdminAppRead,
    AdminAppsResponse,
    AdminStatsRead,
    AdminSubscriptionRead,
    AdminSubscriptionsResponse,
    AdminUpdateSubscriptionRequest,
    AdminUserRead,
    AdminUsersResponse,
    AdminUserSubscriptionRead,
)


def _default_subscription_read() -> AdminUserSubscriptionRead:
    return AdminUserSubscriptionRead(
        tier=SubscriptionTier.FREE,
        status=SubscriptionStatus.INACTIVE,
        provider=None,
        started_at=None,
        expires_at=None,
    )


async def list_users(
    *,
    skip: int,
    limit: int,
    search: str | None,
) -> AdminUsersResponse:
    """List users with subscription status and optional email search."""
    query: dict[str, object] = {}
    if search:
        query["email"] = {"$regex": search, "$options": "i"}

    user_finder = User.find(query) if query else User.find_all()
    total = await user_finder.count()
    users = await user_finder.sort("-created_at").skip(skip).limit(limit).to_list()

    user_ids = [u.id for u in users]
    subscriptions = await Subscription.find(
        In(Subscription.user_id, user_ids),
    ).to_list() if user_ids else []
    sub_map = {str(sub.user_id): sub for sub in subscriptions}

    items: list[AdminUserRead] = []
    for user in users:
        sub = sub_map.get(str(user.id))
        items.append(
            AdminUserRead(
                id=str(user.id),
                email=user.email,
                name=user.name,
                role=user.role,
                created_at=user.created_at,
                subscription=(
                    AdminUserSubscriptionRead(
                        tier=sub.tier,
                        status=sub.status,
                        provider=sub.provider,
                        started_at=sub.started_at,
                        expires_at=sub.expires_at,
                    )
                    if sub
                    else _default_subscription_read()
                ),
            )
        )

    return AdminUsersResponse(items=items, total=total)


async def update_user_role(*, user_id: str, role: UserRole) -> AdminUserRead:
    """Promote/demote user role."""
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")

    user.role = role
    await user.save()

    sub = await Subscription.find_one(Subscription.user_id == PydanticObjectId(user_id))
    return AdminUserRead(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at,
        subscription=(
            AdminUserSubscriptionRead(
                tier=sub.tier,
                status=sub.status,
                provider=sub.provider,
                started_at=sub.started_at,
                expires_at=sub.expires_at,
            )
            if sub
            else _default_subscription_read()
        ),
    )


async def list_subscriptions(
    *,
    skip: int,
    limit: int,
    status: SubscriptionStatus | None,
    tier: SubscriptionTier | None,
) -> AdminSubscriptionsResponse:
    """List subscriptions with optional status/tier filters."""
    query: dict[str, object] = {}
    if status is not None:
        query["status"] = status
    if tier is not None:
        query["tier"] = tier

    sub_finder = Subscription.find(query) if query else Subscription.find_all()
    total = await sub_finder.count()
    subscriptions = await sub_finder.sort("-created_at").skip(skip).limit(limit).to_list()

    user_ids = [sub.user_id for sub in subscriptions]
    users = await User.find(In(User.id, user_ids)).to_list() if user_ids else []
    user_map = {str(user.id): user for user in users}

    items: list[AdminSubscriptionRead] = []
    for sub in subscriptions:
        user = user_map.get(str(sub.user_id))
        items.append(
            AdminSubscriptionRead(
                id=str(sub.id),
                user_id=str(sub.user_id),
                user_email=user.email if user else "unknown@example.com",
                user_name=user.name if user else "Unknown",
                tier=sub.tier,
                status=sub.status,
                provider=sub.provider,
                started_at=sub.started_at,
                expires_at=sub.expires_at,
                created_at=sub.created_at,
                updated_at=sub.updated_at,
            )
        )

    return AdminSubscriptionsResponse(items=items, total=total)


async def update_subscription(
    *,
    user_id: str,
    request: AdminUpdateSubscriptionRequest,
) -> AdminSubscriptionRead:
    """Create or update a user's subscription state."""
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")

    now = utc_now()
    sub = await Subscription.find_one(Subscription.user_id == PydanticObjectId(user_id))
    if sub is None:
        sub = Subscription(
            user_id=PydanticObjectId(user_id),
            tier=request.tier or SubscriptionTier.FREE,
            status=request.status or SubscriptionStatus.INACTIVE,
            provider=None,
            started_at=now if (request.status == SubscriptionStatus.ACTIVE) else None,
            expires_at=request.expires_at,
            created_at=now,
            updated_at=now,
        )
        await sub.insert()
    else:
        if request.tier is not None:
            sub.tier = request.tier
        if request.status is not None:
            sub.status = request.status
            if request.status == SubscriptionStatus.ACTIVE and sub.started_at is None:
                sub.started_at = now
        if request.expires_at is not None:
            sub.expires_at = request.expires_at
        sub.updated_at = now
        await sub.save()

    return AdminSubscriptionRead(
        id=str(sub.id),
        user_id=str(sub.user_id),
        user_email=user.email,
        user_name=user.name,
        tier=sub.tier,
        status=sub.status,
        provider=sub.provider,
        started_at=sub.started_at,
        expires_at=sub.expires_at,
        created_at=sub.created_at,
        updated_at=sub.updated_at,
    )


async def list_apps() -> AdminAppsResponse:
    """List runtime-registered apps with install counts and tier requirements."""
    installations = await UserAppInstallation.find(
        UserAppInstallation.status == InstallationStatus.ACTIVE,
    ).to_list()
    install_count_map: dict[str, int] = {}
    for item in installations:
        install_count_map[item.app_id] = install_count_map.get(item.app_id, 0) + 1

    items: list[AdminAppRead] = []
    for app_id, plugin in sorted(PLUGIN_REGISTRY.items()):
        manifest = plugin["manifest"]
        items.append(
            AdminAppRead(
                id=app_id,
                name=manifest.name,
                category=manifest.category,
                requires_tier=manifest.requires_tier,
                install_count=install_count_map.get(app_id, 0),
            )
        )

    return AdminAppsResponse(items=items, total=len(items))


async def update_app_requires_tier(*, app_id: str, requires_tier: SubscriptionTier) -> AdminAppRead:
    """Update app requires_tier at runtime (non-persistent)."""
    plugin = get_plugin(app_id)
    if plugin is None:
        raise HTTPException(status_code=404, detail=f"App '{app_id}' not found")

    plugin["manifest"].requires_tier = requires_tier

    install_count = await UserAppInstallation.find(
        UserAppInstallation.app_id == app_id,
        UserAppInstallation.status == InstallationStatus.ACTIVE,
    ).count()

    manifest = plugin["manifest"]
    return AdminAppRead(
        id=app_id,
        name=manifest.name,
        category=manifest.category,
        requires_tier=manifest.requires_tier,
        install_count=install_count,
    )


async def get_stats() -> AdminStatsRead:
    """Return top-level admin dashboard stats."""
    total_users = await User.find_all().count()
    admin_users = await User.find(User.role == UserRole.ADMIN).count()
    active_subscriptions = await Subscription.find(Subscription.status == SubscriptionStatus.ACTIVE).count()
    paid_subscriptions = await Subscription.find(Subscription.tier == SubscriptionTier.PAID).count()
    installed_apps = await UserAppInstallation.find(
        UserAppInstallation.status == InstallationStatus.ACTIVE,
    ).count()

    return AdminStatsRead(
        total_users=total_users,
        admin_users=admin_users,
        active_subscriptions=active_subscriptions,
        paid_subscriptions=paid_subscriptions,
        installed_apps=installed_apps,
    )


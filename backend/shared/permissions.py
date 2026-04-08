"""Platform-wide permission matrix.

Defines which features are accessible per subscription tier.
Permission name convention: "{app_id}_{feature}"

Admin role always has access to all permissions — checked at the
require_permission() dependency level, not in this matrix.
"""


from shared.enums import SubscriptionTier

# Permission matrix: permission_name -> {tier: allowed}
# If a permission is not listed here, it is denied for all tiers.
PERMISSIONS: dict[str, dict[SubscriptionTier, bool]] = {
    # ── App installation ───────────────────────────────────────────
    "finance_install": {"free": False, "paid": True},
    "calendar_install": {"free": False, "paid": True},
    "billing_install": {"free": True, "paid": True},
    "todo_install": {"free": True, "paid": True},
    "chat_install": {"free": True, "paid": True},
    "health2_install": {"free": True, "paid": True},
    # ── Feature-level per app ─────────────────────────────────────
    "calendar_recurring": {"free": False, "paid": True},
    "calendar_export": {"free": False, "paid": True},
    "todo_recurring": {"free": False, "paid": True},
    "finance_wallet_multiple": {"free": False, "paid": True},
    "finance_export": {"free": False, "paid": True},
    "chat_ai_unlimited": {"free": False, "paid": True},
    # ── Admin ─────────────────────────────────────────────────────
    "admin_users_view": {"free": False, "paid": False},
    "admin_subscriptions_view": {"free": False, "paid": False},
    "admin_apps_manage": {"free": False, "paid": False},
}

# Tier priority for numeric comparison
TIER_PRIORITY: dict[SubscriptionTier, int] = {"free": 0, "paid": 1}


def has_permission(tier: SubscriptionTier, permission: str) -> bool:
    """Return True if the given tier has the named permission.

    Missing permission = denied (safe default).
    """
    return PERMISSIONS.get(permission, {}).get(tier, False)


def meets_minimum_tier(user_tier: SubscriptionTier, required_tier: SubscriptionTier) -> bool:
    """Return True if user_tier >= required_tier (ordinal comparison)."""
    return TIER_PRIORITY.get(user_tier, 0) >= TIER_PRIORITY.get(required_tier, 0)


def all_permissions_for_tier(tier: SubscriptionTier) -> list[str]:
    """Return list of all permission names granted to the given tier."""
    return [perm for perm, matrix in PERMISSIONS.items() if matrix.get(tier, False)]

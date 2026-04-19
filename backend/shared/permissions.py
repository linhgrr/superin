"""Platform-wide permission matrix.

Defines which features are accessible per subscription tier.
Permission name convention: "{app_id}_{feature}"

Admin role always has access to all permissions — checked at the
require_permission() dependency level, not in this matrix.
"""

from shared.enums import PermissionKey, SubscriptionTier

# Permission matrix: permission_name -> {tier: allowed}
# If a permission is not listed here, it is denied for all tiers.
PERMISSIONS: dict[PermissionKey, dict[SubscriptionTier, bool]] = {
    # ── Feature-level (platform-wide patterns) ─────────────────────
    # App-specific feature flags should live in the plugin's own service layer,
    # not in the platform permission matrix. Plugins gate their own features.
    #
    # Example (plugin owns this internally):
    #   "calendar_recurring": {"free": False, "paid": True},
    #   "finance_wallet_multiple": {"free": False, "paid": True},
    #
    # Platform-wide feature flags belong here:
    # Informational/UI-facing permission only.
    # Authoritative chat throughput limits are enforced in core/chat/routes.py
    # via tier-based rate limits, not via require_permission().
    PermissionKey.CHAT_AI_UNLIMITED: {
        SubscriptionTier.FREE: False,
        SubscriptionTier.PAID: True,
    },
    # ── Admin ─────────────────────────────────────────────────────
    PermissionKey.ADMIN_USERS_VIEW: {
        SubscriptionTier.FREE: False,
        SubscriptionTier.PAID: False,
    },
    PermissionKey.ADMIN_SUBSCRIPTIONS_VIEW: {
        SubscriptionTier.FREE: False,
        SubscriptionTier.PAID: False,
    },
    PermissionKey.ADMIN_APPS_MANAGE: {
        SubscriptionTier.FREE: False,
        SubscriptionTier.PAID: False,
    },
}

# Tier priority for numeric comparison
TIER_PRIORITY: dict[SubscriptionTier, int] = {
    SubscriptionTier.FREE: 0,
    SubscriptionTier.PAID: 1,
}


def has_permission(tier: SubscriptionTier, permission: PermissionKey | str) -> bool:
    """Return True if the given tier has the named permission.

    Missing permission = denied (safe default).
    """
    if isinstance(permission, str):
        try:
            key = PermissionKey(permission)
        except ValueError:
            return False
    else:
        key = permission
    return PERMISSIONS.get(key, {}).get(tier, False)


def meets_minimum_tier(user_tier: SubscriptionTier, required_tier: SubscriptionTier) -> bool:
    """Return True if user_tier >= required_tier (ordinal comparison)."""
    return TIER_PRIORITY.get(user_tier, 0) >= TIER_PRIORITY.get(required_tier, 0)


def all_permissions_for_tier(tier: SubscriptionTier) -> list[PermissionKey]:
    """Return list of all permission names granted to the given tier."""
    return [perm for perm, matrix in PERMISSIONS.items() if matrix.get(tier, False)]

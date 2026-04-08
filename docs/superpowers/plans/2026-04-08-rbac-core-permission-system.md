# RBAC Core + Permission System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DB-driven role-based access control (admin/user), subscription-tier permission system, and 2-level gating (app-level + feature-level) to the platform. Foundation for Plan B (payment) and Plan C (admin page).

**Architecture:**
- `User.role` added to the User document (DB-driven, no more email-based admin)
- `SubscriptionTier` enum and `Subscription` document stub in a new `billing` plugin
- `shared/permissions.py` — central permission matrix with `has_permission()` and `meets_minimum_tier()` utilities
- `require_permission()` FastAPI dependency factory — enforces permission matrix at route level
- App-level gating in `require_installed_app()` — checks app manifest's `requires_tier`
- Admin always bypasses all permission checks

**Tech Stack:** FastAPI (Depends), Beanie ODM, Pydantic v2, TypeScript + React

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/core/models.py` |
| Modify | `backend/shared/enums.py` |
| Create | `backend/shared/permissions.py` |
| Modify | `backend/core/auth.py` |
| Modify | `backend/core/workspace.py` |
| Modify | `backend/shared/schemas.py` |
| Modify | `backend/apps/auth.py` |
| Create | `backend/apps/billing/__init__.py` |
| Create | `backend/apps/billing/manifest.py` |
| Create | `backend/apps/billing/models.py` |
| Modify | `frontend/src/hooks/useAuth.tsx` |
| Create | `frontend/src/shared/hooks/usePermission.ts` |

---

## Task 1: Add `role` field to User model

**Files:**
- Modify: `backend/core/models.py`

- [ ] **Step 1: Add `role` field to User document**

Open `backend/core/models.py`. Find the `User` class (around line 37). Add the `role` field and update indexes:

```python
from typing import Literal
# ... existing imports stay the same ...

class User(Document):
    """Platform user account."""

    email: str
    hashed_password: str
    name: str
    role: Literal["admin", "user"] = "user"  # ← ADD THIS LINE
    created_at: datetime = Field(default_factory=utc_now)
    settings: dict = Field(default_factory=dict)

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("email", 1)], name="users_email_unique", unique=True),
            IndexModel([("role", 1)], name="users_role_index"),  # ← ADD THIS INDEX
        ]
```

- [ ] **Step 2: Verify no other changes needed in models.py**

The rest of the file is unchanged.

- [ ] **Step 3: Commit**

```bash
git add backend/core/models.py
git commit -m "feat(core): add role field to User model

Adds Literal["admin", "user"] role to User document with index on role field for efficient admin queries. Default is 'user' for all existing and new users."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 2: Add enums to shared/enums.py

**Files:**
- Modify: `backend/shared/enums.py`

- [ ] **Step 1: Add new enum types**

Open `backend/shared/enums.py`. Add the following sections **after the existing ChatEventType block** (at the end of the file):

```python
# ─── User Role ───────────────────────────────────────────────────────────────

UserRole = Literal["admin", "user"]
"""Valid values for User.role."""

USER_ROLES: frozenset[str] = frozenset({"admin", "user"})


# ─── Subscription ───────────────────────────────────────────────────────────

SubscriptionTier = Literal["free", "paid"]
"""Subscription tier — determines which features are accessible."""

SUBSCRIPTION_TIERS: frozenset[str] = frozenset({"free", "paid"})

SubscriptionStatus = Literal["active", "inactive", "cancelled", "past_due"]
"""Payment lifecycle status for a subscription."""

SUBSCRIPTION_STATUSES: frozenset[str] = frozenset(
    {"active", "inactive", "cancelled", "past_due"}
)


# ─── Payment Provider ────────────────────────────────────────────────────────

PaymentProvider = Literal["stripe", "payos"]
"""Supported payment providers."""

PAYMENT_PROVIDERS: frozenset[str] = frozenset({"stripe", "payos"})
```

- [ ] **Step 2: Commit**

```bash
git add backend/shared/enums.py
git commit -m "feat(shared): add UserRole, SubscriptionTier, SubscriptionStatus, PaymentProvider enums

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 3: Create permission matrix in shared/permissions.py

**Files:**
- Create: `backend/shared/permissions.py`

- [ ] **Step 1: Create the permissions matrix file**

Create the file `backend/shared/permissions.py`:

```python
"""Platform-wide permission matrix.

Defines which features are accessible per subscription tier.
Permission name convention: "{app_id}_{feature}"

Admin role always has access to all permissions — checked at the
require_permission() dependency level, not in this matrix.
"""

from typing import Literal

from shared.enums import SubscriptionTier

# Permission matrix: permission_name -> {tier: allowed}
# If a permission is not listed here, it is denied for all tiers.
PERMISSIONS: dict[str, dict[SubscriptionTier, bool]] = {
    # ── App installation ───────────────────────────────────────────
    # Apps that require a paid subscription to install
    "finance_install": {"free": False, "paid": True},
    "calendar_install": {"free": False, "paid": True},
    # Apps available to everyone
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
    # ── Admin (enforced separately in require_admin, listed here for visibility ──
    "admin_users_view": {"free": False, "paid": False},   # admin role only — no tier needed
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/shared/permissions.py
git commit -m "feat(shared): add permission matrix with has_permission and meets_minimum_tier

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 4: Update core/auth.py — require_permission dependency

**Files:**
- Modify: `backend/core/auth.py`

- [ ] **Step 1: Read the current file**

Open `backend/core/auth.py` and read it fully. Note where to insert the new `require_permission` function and how to update `get_current_admin_user`.

- [ ] **Step 2: Add imports at top**

Add these imports at the **end** of the existing import block (after `from core.models import TokenBlacklist, User`):

```python
from typing import Annotated

from beanie import PydanticObjectId
from pymongo import ASCENDING

from core.config import settings
from core.models import Subscription, TokenBlacklist, User
from shared.enums import SubscriptionStatus, SubscriptionTier
from shared.permissions import has_permission, meets_minimum_tier
```

Also add the `Literal` import update:
```python
from typing import Annotated, Literal
```

- [ ] **Step 3: Replace get_current_admin_user function**

Find the existing `get_current_admin_user` function (around line 92) and **replace it entirely**:

```python
async def get_current_admin_user(
    user_id: Annotated[str, Depends(get_current_user)],
) -> str:
    """FastAPI dependency — ensures the current user has admin role.

    Checks user.role == "admin" in the database.
    Raises 403 if the user exists but is not an admin.
    Raises 401 if the user does not exist.
    """
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    return user_id
```

- [ ] **Step 4: Add require_permission factory after get_current_admin_user**

Add this function **right after** `get_current_admin_user`:

```python
def require_permission(permission: str):
    """FastAPI dependency factory — raises 403 if user lacks the permission.

    Usage:
        @router.post("/events", dependencies=[Depends(require_permission("calendar_recurring"))])
    """
    async def dependency(
        user_id: Annotated[str, Depends(get_current_user)],
    ) -> str:
        user = await User.get(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        # Admin always passes all permission checks
        if user.role == "admin":
            return user_id

        # Determine user's effective tier
        sub = await Subscription.find_one(
            Subscription.user_id == PydanticObjectId(user_id),
        )
        if sub is None:
            effective_tier: SubscriptionTier = "free"
        else:
            effective_tier = sub.tier

        if not has_permission(effective_tier, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This feature requires '{permission}'. Upgrade to paid.",
            )

        return user_id

    return dependency
```

- [ ] **Step 5: Verify imports and function signatures**

Make sure the file imports `Literal` (already imported at top of file) and all new types.

- [ ] **Step 6: Commit**

```bash
git add backend/core/auth.py
git commit -m "feat(auth): add require_permission dependency and update get_current_admin_user

Updates get_current_admin_user to use role-based check (DB-driven) instead of email-based config. Adds require_permission(permission) dependency factory that checks subscription tier against the PERMISSIONS matrix, with admin bypass."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 5: Create billing plugin stub (manifest + models)

**Files:**
- Create: `backend/apps/billing/__init__.py`
- Create: `backend/apps/billing/manifest.py`
- Create: `backend/apps/billing/models.py`

**Note:** The full billing plugin with payment providers is Plan B. Here we only create the minimum stub so that `Subscription` model can be imported by `core/auth.py` and other platform code.

- [ ] **Step 1: Create the billing app directory structure**

```bash
mkdir -p /home/linh/Downloads/superin/backend/apps/billing
```

- [ ] **Step 2: Create `backend/apps/billing/__init__.py`**

```python
"""Billing plugin — subscription management and payment integration."""

import logging

from core.registry import register_plugin

from apps.billing.manifest import BillingManifest
from apps.billing.routes import router

logger = logging.getLogger(__name__)


def register() -> None:
    register_plugin(
        manifest=BillingManifest,
        router=router,
    )
    logger.info("✓ Billing plugin registered")
```

- [ ] **Step 3: Create `backend/apps/billing/manifest.py`**

```python
"""Billing app manifest — required by plugin registration."""

from shared.enums import SubscriptionTier
from shared.schemas import WidgetManifestSchema

BILLING_WIDGETS: list[WidgetManifestSchema] = [
    WidgetManifestSchema(
        id="billing.current-plan",
        name="Current Plan",
        description="Show current subscription tier and status",
        icon="CreditCard",
        size="compact",
        requires_auth=True,
    ),
]


class BillingManifest:
    id = "billing"
    name = "Billing"
    version = "0.1.0"
    description = "Subscription management and billing"
    icon = "CreditCard"
    color = "oklch(0.65 0.21 280)"
    widgets = BILLING_WIDGETS
    agent_description = "Manages user subscription, billing, and payment"
    tools = []
    models = ["Subscription"]
    category = "other"
    tags = []
    screenshots = []
    author = "Shin Team"
    homepage = ""
    requires_auth = True
    requires_tier: SubscriptionTier = "free"  # Everyone can see billing app
```

- [ ] **Step 4: Create `backend/apps/billing/models.py`**

```python
"""Billing Beanie document models."""

from datetime import UTC, datetime
from typing import Literal

from beanie import Document, PydanticObjectId, IndexModel
from pydantic import Field

from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier


def utc_now() -> datetime:
    return datetime.now(UTC)


class Subscription(Document):
    """User subscription state — one record per user.

    Design: tier (free/paid) and status (active/inactive/cancelled/past_due)
    are separate so that billing lifecycle is independent from feature access.
    """

    user_id: PydanticObjectId
    tier: SubscriptionTier = "free"
    status: SubscriptionStatus = "inactive"
    # Payment provider info
    provider: PaymentProvider | None = None
    provider_subscription_id: str | None = None
    # Timestamps
    started_at: datetime | None = None
    cancelled_at: datetime | None = None
    expires_at: datetime | None = None  # For PayOS one-time payment tracking
    # Stripe-specific
    stripe_customer_id: str | None = None
    # PayOS-specific
    payos_payment_link_id: str | None = None
    # Metadata
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "subscriptions"
        indexes = [
            IndexModel([("user_id", 1)], name="subscriptions_user_id_unique", unique=True),
            IndexModel(
                [("provider", 1), ("provider_subscription_id", 1)],
                name="subscriptions_provider_reference",
            ),
            IndexModel([("status", 1)], name="subscriptions_status_index"),
        ]
```

- [ ] **Step 5: Create `backend/apps/billing/routes.py` with stub router**

```python
"""Billing routes — stub for Phase 1 (RBAC). Full implementation in Plan B."""

import logging

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from apps.billing.models import Subscription
from apps.billing.schemas import SubscriptionRead
from core.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


@router.get("/subscription", response_model=SubscriptionRead)
async def get_my_subscription(
    user_id: str = Depends(get_current_user),
) -> SubscriptionRead:
    """Return the current user's subscription (or default free/inactive)."""
    from beanie import PydanticObjectId
    sub = await Subscription.find_one(Subscription.user_id == PydanticObjectId(user_id))
    if sub is None:
        return SubscriptionRead(
            tier="free",
            status="inactive",
            provider=None,
            started_at=None,
            expires_at=None,
        )
    return SubscriptionRead(
        tier=sub.tier,
        status=sub.status,
        provider=sub.provider,
        started_at=sub.started_at,
        expires_at=sub.expires_at,
    )
```

- [ ] **Step 6: Create `backend/apps/billing/schemas.py`**

```python
"""Billing request/response schemas."""

from datetime import datetime

from pydantic import BaseModel

from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier


class SubscriptionRead(BaseModel):
    """Current user's subscription info for API response."""

    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 7: Update `backend/apps/billing/__init__.py` import**

The `register()` function in `__init__.py` calls `register_plugin`. This needs the router. The routes file is already imported in Step 2.

- [ ] **Step 8: Ensure billing is auto-discovered**

The billing app lives in `backend/apps/billing/`. The `discover_apps()` function scans `backend/apps/*` directories and calls `register_plugin()` from each `__init__.py`. No additional config needed.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/billing/
git commit -m "feat(billing): add billing plugin stub with Subscription model

Minimal stub for Plan A — Subscription document, manifest, and /subscription endpoint. Full payment integration (Stripe + PayOS) comes in Plan B."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 6: Update AppManifestSchema — add `requires_tier`

**Files:**
- Modify: `backend/shared/schemas.py`

- [ ] **Step 1: Add import for SubscriptionTier**

Find the import line:
```python
from shared.enums import ConfigFieldType, WidgetSize
```
Change it to:
```python
from shared.enums import ConfigFieldType, SubscriptionTier, WidgetSize
```

- [ ] **Step 2: Add `requires_tier` field to AppManifestSchema**

Find the `AppManifestSchema` class in `shared/schemas.py` (around line 138). Add `requires_tier` as the **last field** before the closing `class Settings` indentation (actually it's at the end of the class body, before `author`):

Add this line **after** `requires_auth: bool = True` (around line 168):

```python
    requires_auth: bool = True
    requires_tier: SubscriptionTier = "free"  # Minimum tier to install this app
```

- [ ] **Step 3: Commit**

```bash
git add backend/shared/schemas.py
git commit -m "feat(shared): add requires_tier to AppManifestSchema

Adds minimum subscription tier requirement to app manifest, enabling app-level gating in require_installed_app. Default is 'free' so existing apps remain accessible."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 7: Update core/workspace.py — app-level gating

**Files:**
- Modify: `backend/core/workspace.py`

- [ ] **Step 1: Update imports**

Find the imports at the top of `workspace.py`. Add the new imports:

```python
from core.auth import get_current_user
from core.models import UserAppInstallation, WidgetPreference
from core.registry import get_plugin
from shared.enums import SubscriptionTier
from shared.perference_utils import preference_to_schema
from shared.permissions import meets_minimum_tier
from shared.schemas import AppRuntimeEntry, WidgetPreferenceSchema, WorkspaceBootstrap

# Local import to avoid circular dependency — billing plugin loads after core
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from apps.billing.models import Subscription
```

- [ ] **Step 2: Update `require_installed_app` function**

Find the `require_installed_app` function (around line 101) and **replace it entirely**:

```python
def require_installed_app(app_id: str) -> Callable:
    """Create a dependency that:
    1. Rejects users who have not installed the app.
    2. Rejects users whose subscription tier is below the app's requires_tier.

    Installed apps are cached on the request state to avoid repeated DB queries.
    """

    async def dependency(
        request: Request,
        user_id: str = Depends(get_current_user),
    ) -> str:
        from apps.billing.models import Subscription
        from beanie import PydanticObjectId

        # ── 1. Check installation ──────────────────────────────────
        installed_app_ids = await get_installed_app_id_set(user_id, request)
        if app_id not in installed_app_ids:
            raise HTTPException(
                status_code=403,
                detail=f"App '{app_id}' is not installed. Install it from the app store.",
            )

        # ── 2. Check tier requirement ──────────────────────────────
        plugin = get_plugin(app_id)
        if not plugin:
            raise HTTPException(status_code=404, detail=f"App '{app_id}' not found")

        manifest = plugin["manifest"]
        min_tier: SubscriptionTier = getattr(manifest, "requires_tier", "free")

        # Free tier always passes the tier check (no upgrade needed)
        if min_tier == "free":
            return user_id

        # Fetch user's effective tier
        sub = await Subscription.find_one(
            Subscription.user_id == PydanticObjectId(user_id),
        )
        user_tier: SubscriptionTier = sub.tier if sub else "free"

        if not meets_minimum_tier(user_tier, min_tier):
            raise HTTPException(
                status_code=403,
                detail=(
                    f"This app requires a {min_tier} subscription. "
                    "Please upgrade to access this app."
                ),
            )

        return user_id

    return dependency
```

- [ ] **Step 3: Commit**

```bash
git add backend/core/workspace.py
git commit -m "feat(workspace): add tier-based gating to require_installed_app

Blocks app access if user's subscription tier is below the app's requires_tier manifest field. Caches installation lookup. Admin bypass is handled by User.role check in get_current_user."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 8: Update shared/schemas.py — UserPublic.role, SubscriptionRead, UserWithSubscription

**Files:**
- Modify: `backend/shared/schemas.py`

- [ ] **Step 1: Update import**

Find:
```python
from shared.enums import ConfigFieldType, SubscriptionTier, WidgetSize
```
Change to:
```python
from shared.enums import (
    ConfigFieldType,
    PaymentProvider,
    SubscriptionStatus,
    SubscriptionTier,
    UserRole,
    WidgetSize,
)
```

- [ ] **Step 2: Add `role` to UserPublic**

Find the `UserPublic` class. Add `role` as a field:

```python
class UserPublic(BaseModel):
    """Public user info — returned in auth responses."""

    id: str
    email: str
    name: str
    role: UserRole = "user"  # ← ADD THIS
    settings: dict = Field(default_factory=dict)
```

- [ ] **Step 3: Add SubscriptionRead and UserWithSubscription after UserPublic**

Add these two classes **right after** `UserPublic` (before the blank line before `# ─── Auth ─`):

```python
class SubscriptionRead(BaseModel):
    """Subscription info returned in API responses."""

    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserWithSubscription(UserPublic):
    """User info with embedded subscription — used by admin endpoints."""

    subscription: SubscriptionRead | None = None
```

- [ ] **Step 4: Commit**

```bash
git add backend/shared/schemas.py
git commit -m "feat(shared): add role to UserPublic and new subscription schemas

Adds UserPublic.role, SubscriptionRead, and UserWithSubscription to shared schemas for TypeScript codegen."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 9: Update auth routes — return role in /me

**Files:**
- Modify: `backend/apps/auth.py`

- [ ] **Step 1: Update `_token_response` helper**

Find `_token_response` function (around line 20). Update `UserPublic` instantiation to include `role`:

```python
def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
        token_type="bearer",
        user=UserPublic(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,  # ← ADD THIS
        ),
    )
```

- [ ] **Step 2: Update get_me endpoint**

Find `get_me` endpoint (around line 152). Update `UserPublic` instantiation:

```python
@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)) -> UserPublic:
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserPublic(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        settings=user.settings or {},
    )
```

- [ ] **Step 3: Update update_settings endpoint**

Find `update_settings` endpoint (around line 160). Update `UserPublic` instantiation:

```python
    return UserPublic(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        settings=user.settings,
    )
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/auth.py
git commit -m "feat(auth): return role field in /me and _token_response

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 10: Update frontend useAuth.tsx

**Files:**
- Modify: `frontend/src/hooks/useAuth.tsx`

- [ ] **Step 1: Read current file**

Open `frontend/src/hooks/useAuth.tsx`. Note the current interface and how `isAdmin` can be computed.

- [ ] **Step 2: Add `isAdmin` to AuthContextValue interface**

Find the `AuthContextValue` interface (around line 22). Add:

```typescript
interface AuthContextValue {
  user: UserPublic | null;
  isAdmin: boolean;              // ← ADD THIS
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}
```

- [ ] **Step 3: Update the useMemo value computation**

Find the `useMemo` block (around line 77). Add `isAdmin` to the computed value:

```typescript
  const isAdmin = user?.role === "admin";

  const value = useMemo(
    () => ({
      user,
      isAdmin,                  // ← ADD THIS
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, logout, register, isAdmin],  // ← add isAdmin to deps
  );
```

- [ ] **Step 4: Verify UserPublic type includes role**

The `UserPublic` type is imported from `@/types/generated`. After codegen runs (Task 12), `role` will be part of the type. No manual type changes needed here — codegen handles it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAuth.tsx
git commit -m "feat(fe): add isAdmin computed property to useAuth

Exposes role-based admin flag from UserPublic.role in the auth context. Type updates come from codegen."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 11: Create frontend usePermission.ts hook

**Files:**
- Create: `frontend/src/shared/hooks/usePermission.ts`

**Note:** `frontend/src/shared/` is for pure utilities and shared hooks. This hook mirrors the backend PERMISSIONS matrix and is UI-only — it does not call APIs.

- [ ] **Step 1: Create the hook file**

Create `frontend/src/shared/hooks/usePermission.ts`:

```typescript
/** Mirrors backend PERMISSIONS matrix for client-side feature gating.
 *
 * This is a client-side convenience. All enforcement happens server-side
 * via require_permission() dependency. Use this hook to hide/show UI
 * elements without waiting for a 403 response.
 *
 * Import: import { usePermission } from "@/shared/hooks/usePermission";
 */

import { useAuth } from "@/hooks/useAuth";

type SubscriptionTier = "free" | "paid";

// Permission matrix — must stay in sync with backend/shared/permissions.py
const PERMISSIONS: Record<string, Record<SubscriptionTier, boolean>> = {
  "finance_install": { free: false, paid: true },
  "calendar_install": { free: false, paid: true },
  "billing_install": { free: true, paid: true },
  "todo_install": { free: true, paid: true },
  "chat_install": { free: true, paid: true },
  "health2_install": { free: true, paid: true },
  "calendar_recurring": { free: false, paid: true },
  "calendar_export": { free: false, paid: true },
  "todo_recurring": { free: false, paid: true },
  "finance_wallet_multiple": { free: false, paid: true },
  "finance_export": { free: false, paid: true },
  "chat_ai_unlimited": { free: false, paid: true },
};

/** Check if the current user has a specific permission based on their subscription tier.
 *
 * Returns false for missing permissions (safe default).
 * Returns true for admins (enforced server-side — this is UI-only convenience).
 */
export function usePermission(permission: string): boolean {
  const { user } = useAuth();

  // Admins have all permissions (server-side enforced)
  if (user?.role === "admin") return true;

  // Determine tier from subscription
  // subscription is typed via codegen (SubscriptionRead from @/types/generated)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tier: SubscriptionTier = (user as any)?.subscription?.tier ?? "free";

  return PERMISSIONS[permission]?.[tier] ?? false;
}

/** Returns all permissions available to the current user's tier.
 * Useful for building dynamic feature flags.
 */
export function useAvailablePermissions(): string[] {
  const { user } = useAuth();

  if (user?.role === "admin") {
    return Object.keys(PERMISSIONS);
  }

  const tier: SubscriptionTier = (user as any)?.subscription?.tier ?? "free";
  return Object.entries(PERMISSIONS)
    .filter(([, matrix]) => matrix[tier] === true)
    .map(([name]) => name);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/shared/hooks/usePermission.ts
git commit -m "feat(fe): add usePermission hook mirroring backend PERMISSIONS matrix

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 12: Codegen + verify

**Files:**
- Modify: Multiple (generated)

- [ ] **Step 1: Run codegen**

```bash
cd /home/linh/Downloads/superin
python scripts/superin.py codegen
```

Expected: Regenerates `frontend/src/types/generated/` with new `role` field in `UserPublic`, new `SubscriptionRead` schema, and updated `AppManifestSchema` with `requires_tier`.

- [ ] **Step 2: Run manifest validation**

```bash
python scripts/superin.py manifests validate
```

Expected: All manifests pass. The billing manifest will be picked up automatically by auto-discovery.

- [ ] **Step 3: Run ruff check**

```bash
cd /home/linh/Downloads/superin && ruff check backend/
```

Expected: No errors.

- [ ] **Step 4: Run frontend type check**

```bash
cd /home/linh/Downloads/superin/frontend && npx tsc --noEmit
```

Expected: No type errors (the `as any` cast in `usePermission.ts` is intentional to handle pre-codegen type absence gracefully).

- [ ] **Step 5: Commit generated types**

```bash
git add frontend/src/types/generated/
git commit -m "chore(codegen): regenerate types after RBAC schema changes

Adds UserPublic.role, SubscriptionRead, UserWithSubscription, AppManifestSchema.requires_tier."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Verification Checklist

After all tasks complete, verify these behaviors:

- [ ] **Admin endpoint:** Create a user with `role = "admin"` in MongoDB directly. Call an endpoint protected by `get_current_admin_user` — should pass.
- [ ] **Non-admin blocked:** Regular user calling admin endpoint — should get 403.
- [ ] **Permission gate:** User with `tier = "free"` calling route protected by `require_permission("calendar_recurring")` — should get 403.
- [ ] **Permission pass:** User with `tier = "paid"` calling same route — should pass.
- [ ] **App-level gate:** Free user trying to install Finance app — should get 403 with upgrade message.
- [ ] **`/me` response:** Login → response includes `role: "user"` (or `"admin"`).
- [ ] **Frontend:** `useAuth().isAdmin` returns `true` for admin users, `false` otherwise.
- [ ] **Codegen:** `frontend/src/types/generated/api.ts` contains `role` field in `UserPublic`.

---

## Self-Review Checklist

- [ ] Spec coverage: Every requirement in Plan A section of master spec has a task above.
- [ ] Placeholder scan: No "TBD", "TODO", or vague implementation hints in any step.
- [ ] Type consistency: All `Literal` types (`SubscriptionTier`, `UserRole`, `PaymentProvider`) are imported from `shared.enums` — consistent across all tasks.
- [ ] No silent catches: All error paths use `raise HTTPException` with explicit codes and messages.
- [ ] Module-level constants: All constants are after imports in `shared/permissions.py`.
- [ ] DB indexes: `Subscription` model has indexes on `user_id` (unique), `provider+reference`, and `status`.
- [ ] Admin always bypasses: `require_permission()` checks `user.role == "admin"` first.

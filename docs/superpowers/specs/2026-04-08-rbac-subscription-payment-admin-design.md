# RBAC + Subscription + Payment Integration + Admin Page — Master Design

**Status:** Draft
**Date:** 2026-04-08
**Scope:** RBAC, Subscription system, Payment provider interface (Stripe + PayOS), Admin page
**Plans:** Plan A (RBAC Core), Plan B (Payment Integration), Plan C (Admin Page)

---

## 1. Overview

Thêm 4 subsystems mới vào Shin SuperApp:

1. **RBAC** — Role-based access control (admin vs user)
2. **Subscription** — Tier-based capability gating (free vs paid)
3. **Payment Interface** — Abstract provider layer (Stripe + PayOS)
4. **Admin Page** — Management UI cho users, subscriptions, và app catalog

```
┌─────────────────────────────────────────────────────────┐
│  Admin Page (FE)                                        │
│  ├── Users management (promote/demote)                  │
│  ├── Subscriptions management (upgrade/downgrade)       │
│  └── App catalog (enable/disable)                       │
├─────────────────────────────────────────────────────────┤
│  Backend — Platform Core                                │
│  ├── RBAC: User.role, require_admin, require_permission │
│  ├── Subscription: Subscription document                 │
│  ├── Permissions: PERMISSIONS matrix                    │
│  └── Payment Interface: PaymentProvider ABC             │
│       ├── StripeProvider                                │
│       └── PayOSProvider                                 │
├─────────────────────────────────────────────────────────┤
│  Backend — Apps                                         │
│  └── billing/ (plugin) — webhook handlers, checkout API  │
├─────────────────────────────────────────────────────────┤
│  MongoDB                                                 │
│  ├── users (User.role added)                            │
│  └── subscriptions                                      │
└─────────────────────────────────────────────────────────┘
```

---

## 2. RBAC System

### 2.1 User Model Changes

**File:** `backend/core/models.py`

```python
class User(Document):
    """Platform user account."""
    email: str
    hashed_password: str
    name: str
    role: Literal["admin", "user"] = "user"  # ← thêm mới
    created_at: datetime = Field(default_factory=utc_now)
    settings: dict = Field(default_factory=dict)

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("email", 1)], name="users_email_unique", unique=True),
            IndexModel([("role", 1)], name="users_role_index"),  # ← index cho admin queries
        ]
```

**Migration note:** Existing users có `role = "user"` (default). Admins được set bằng admin page.

### 2.2 Auth Dependency Changes

**File:** `backend/core/auth.py`

Thêm 2 dependencies mới:

```python
async def get_current_admin_user(
    user_id: Annotated[str, Depends(get_current_user)],
) -> str:
    """Ensures the current user has admin role."""
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id

def require_permission(permission: str):
    """Dependency — raises 403 if user lacks the permission."""
    async def dep(user_id: Annotated[str, Depends(get_current_user)]):
        user = await User.get(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Admin bypass: admins always pass
        if user.role == "admin":
            return user_id
        # Fetch subscription to determine tier
        sub = await Subscription.find_one(Subscription.user_id == user.id)
        tier = sub.tier if sub else "free"
        if not PERMISSIONS.get(permission, {}).get(tier, False):
            raise HTTPException(
                status_code=403,
                detail=f"Feature requires {permission}. Upgrade to paid.",
            )
        return user_id
    return dep
```

**Remove:** `get_current_admin_user` email-based logic (replace với role-based).

### 2.3 JWT Payload

JWT chỉ chứa `sub: user_id`. Role/subscription info luôn fetch từ DB.

```python
# Token payload
{"sub": "<user_id>", "exp": ..., "type": "access", "jti": "..."}
```

---

## 3. Subscription System

### 3.1 Subscription Document

**File:** `backend/apps/billing/models.py` (plugin — tự động discover)

```python
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, UTC

SubscriptionTier = Literal["free", "paid"]
SubscriptionStatus = Literal["active", "inactive", "cancelled", "past_due"]

def utc_now() -> datetime:
    return datetime.now(UTC)

class Subscription(Document):
    """User subscription state."""
    user_id: PydanticObjectId
    tier: SubscriptionTier = "free"
    status: SubscriptionStatus = "inactive"
    # Payment provider
    provider: Literal["stripe", "payos"] | None = None
    provider_subscription_id: str | None = None  # Stripe sub ID / PayOS order code
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
            IndexModel([("provider", 1), ("provider_subscription_id", 1)]),
            IndexModel([("status", 1)]),
        ]
```

**Design decisions:**
- `user_id` là unique — mỗi user có 1 subscription record
- `tier` và `status` tách biệt: tier chỉ tier (free/paid), status chỉ payment lifecycle
- `provider` để biết dùng Stripe hay PayOS
- `expires_at` support PayOS one-time payment (không có automatic renewal như Stripe)

### 3.2 App-Level Gating

**File:** `backend/apps/billing/service.py`

App manifest thêm field:

```python
# Trong manifest.py của mỗi app
class AppManifestSchema(BaseModel):
    # ... existing fields ...
    requires_tier: SubscriptionTier = "free"  # Minimum tier để install
```

**Installation blocked logic** (trong `core/workspace.py`):

```python
# core/workspace.py
async def require_installed_app(app_id: str):
    async def dep(user_id: str = Depends(get_current_user)):
        # Check app manifest's requires_tier
        from core.registry import PLUGIN_REGISTRY
        plugin = PLUGIN_REGISTRY.get(app_id)
        if not plugin:
            raise HTTPException(404, "App not found")

        manifest = plugin.get("manifest")
        min_tier = getattr(manifest, "requires_tier", "free")

        # Get user's subscription tier
        sub = await Subscription.find_one(Subscription.user_id == PydanticObjectId(user_id))
        user_tier = sub.tier if sub else "free"
        tier_priority = {"free": 0, "paid": 1}

        if tier_priority.get(user_tier, 0) < tier_priority.get(min_tier, 0):
            raise HTTPException(
                403,
                detail=f"This app requires a {min_tier} subscription. Please upgrade.",
            )
        return user_id
    return dep
```

### 3.3 Feature-Level Gating

**File:** `backend/shared/permissions.py` (tạo mới)

```python
"""Platform-wide permission matrix.

Defines which features are accessible per subscription tier.
Permission name convention: "{app_id}_{feature}"
Admin always has access to all permissions.
"""

from typing import Literal

SubscriptionTier = Literal["free", "paid"]

# Permission matrix: permission_name -> {tier: allowed}
PERMISSIONS: dict[str, dict[SubscriptionTier, bool]] = {
    # ── App installation ──────────────────────────────
    "billing_install": {"free": True, "paid": True},  # Everyone sees billing app
    "finance_install": {"free": False, "paid": True},  # Finance = paid-only app
    "calendar_install": {"free": False, "paid": True},
    "health2_install": {"free": True, "paid": True},   # Free apps
    # ── Feature-level ─────────────────────────────────
    "calendar_recurring": {"free": False, "paid": True},
    "calendar_export": {"free": False, "paid": True},
    "todo_recurring": {"free": False, "paid": True},
    "finance_wallet_multiple": {"free": False, "paid": True},
    "finance_export": {"free": False, "paid": True},
    # ── Chat ──────────────────────────────────────────
    "chat_ai_unlimited": {"free": False, "paid": True},
    # ── Admin ─────────────────────────────────────────
    "admin_users_view": {"free": False, "paid": False},  # admin role only
    "admin_subscriptions_view": {"free": False, "paid": False},
    "admin_apps_manage": {"free": False, "paid": False},
}

# Tier priority for comparison
TIER_PRIORITY: dict[SubscriptionTier, int] = {"free": 0, "paid": 1}


def has_permission(tier: SubscriptionTier, permission: str) -> bool:
    """Check if a tier has a given permission."""
    if permission not in PERMISSIONS:
        return False
    return PERMISSIONS[permission].get(tier, False)


def meets_minimum_tier(user_tier: SubscriptionTier, required_tier: SubscriptionTier) -> bool:
    """Check if user_tier meets the minimum required tier."""
    return TIER_PRIORITY.get(user_tier, 0) >= TIER_PRIORITY.get(required_tier, 0)
```

**Usage in routes:**

```python
from shared.permissions import PERMISSIONS

@router.post("/events",
    dependencies=[Depends(require_permission("calendar_recurring"))])
async def create_recurring_event(...):
    ...
```

---

## 4. Payment Interface Layer

### 4.1 Abstract Interface

**File:** `backend/apps/billing/providers/base.py`

```python
"""Abstract payment provider interface.

Each provider (Stripe, PayOS) implements this interface.
Payment logic is provider-agnostic in the service layer.
"""

from abc import ABC, abstractmethod
from typing import Literal
from datetime import datetime


class PaymentProvider(ABC):
    """Abstract payment provider interface."""

    provider_name: Literal["stripe", "payos"]

    @abstractmethod
    async def create_checkout_session(
        self,
        user_id: str,
        user_email: str,
        success_url: str,
        cancel_url: str,
        metadata: dict | None = None,
    ) -> dict:
        """Create a checkout/payment link and return redirect URL.

        Returns:
            {"checkout_url": str, "provider_reference": str}
        """
        ...

    @abstractmethod
    async def get_subscription_status(
        self,
        provider_reference: str,
    ) -> dict:
        """Get subscription/payment status from provider.

        Returns:
            {"status": str, "current_period_end": datetime | None}
        """
        ...

    @abstractmethod
    async def cancel_subscription(
        self,
        provider_reference: str,
        cancellation_reason: str | None = None,
    ) -> dict:
        """Cancel a subscription.

        Returns:
            {"cancelled": bool, "effective_date": datetime}
        """
        ...

    @abstractmethod
    async def handle_webhook(self, payload: bytes, headers: dict) -> dict:
        """Process incoming webhook from payment provider.

        Returns:
            {"event_type": str, "user_id": str, "new_status": str}
        """
        ...
```

### 4.2 Stripe Provider

**File:** `backend/apps/billing/providers/stripe.py`

- Implements `PaymentProvider`
- Uses `stripe` Python SDK
- Webhook: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Subscription ID stored in `Subscription.stripe_subscription_id`

**Env vars:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID` (monthly recurring price)

### 4.3 PayOS Provider

**File:** `backend/apps/billing/providers/payos.py`

- Implements `PaymentProvider`
- REST API calls to `https://api-merchant.payos.vn`
- Webhook: verify HMAC-SHA256 signature
- Payment link ID stored in `Subscription.payos_payment_link_id`

**Design note:** PayOS là one-time payment (không auto-renew như Stripe). Flow:
1. User clicks "Subscribe" → tạo payment link → redirect user to PayOS
2. User pays → PayOS webhook → update subscription to `paid` + set `expires_at` (e.g., +30 days)
3. Hết hạn → status chuyển sang `inactive` (dùng cron hoặc check-on-access)

**Env vars:**
- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- `PAYOS_WEBHOOK_SECRET`

### 4.4 Provider Router

**File:** `backend/apps/billing/routes.py`

```python
"""Billing routes — checkout, subscription management, webhooks."""

@router.post("/checkout")
async def create_checkout(
    provider: Literal["stripe", "payos"],
    user_id: str = Depends(get_current_user),
):
    """Create a checkout session / payment link."""
    # Determine provider instance
    if provider == "stripe":
        impl = StripeProvider()
    elif provider == "payos":
        impl = PayOSProvider()
    else:
        raise HTTPException(400, "Invalid payment provider")

    # Redirect URL
    success_url = f"{settings.frontend_url}/billing/success"
    cancel_url = f"{settings.frontend_url}/billing/cancel"

    result = await impl.create_checkout_session(
        user_id=user_id,
        user_email=user.email,
        success_url=success_url,
        cancel_url=cancel_url,
    )

    return result


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Receive Stripe webhooks."""
    impl = StripeProvider()
    return await impl.handle_webhook(
        await request.body(),
        dict(request.headers),
    )


@router.post("/webhook/payos")
async def payos_webhook(request: Request):
    """Receive PayOS webhooks."""
    impl = PayOSProvider()
    return await impl.handle_webhook(
        await request.body(),
        dict(request.headers),
    )
```

---

## 5. Shared Enums Additions

**File:** `backend/shared/enums.py`

Thêm:

```python
# ─── User Role ───────────────────────────────────────────────────────────────

UserRole = Literal["admin", "user"]

# ─── Subscription ───────────────────────────────────────────────────────────

SubscriptionTier = Literal["free", "paid"]
SUBSCRIPTION_TIERS: frozenset[str] = frozenset({"free", "paid"})

SubscriptionStatus = Literal["active", "inactive", "cancelled", "past_due"]
SUBSCRIPTION_STATUSES: frozenset[str] = frozenset({"active", "inactive", "cancelled", "past_due"})

# ─── Payment Provider ────────────────────────────────────────────────────────

PaymentProvider = Literal["stripe", "payos"]
PAYMENT_PROVIDERS: frozenset[str] = frozenset({"stripe", "payos"})
```

---

## 6. UserPublic Schema Changes

**File:** `backend/shared/schemas.py`

```python
class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole  # ← thêm
    settings: dict = Field(default_factory=dict)


class SubscriptionRead(BaseModel):
    """Current user's subscription info."""
    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None
    started_at: datetime | None
    expires_at: datetime | None


class UserWithSubscription(UserPublic):
    """User info with embedded subscription (for admin)."""
    subscription: SubscriptionRead | None
```

---

## 7. Frontend Changes

### 7.1 Auth Context Updates

**File:** `frontend/src/hooks/useAuth.tsx`

```typescript
interface AuthContextValue {
  user: UserPublic | null;       // includes role
  subscription: SubscriptionRead | null;  // ← add
  isAdmin: boolean;               // ← computed
  isLoading: boolean;
  isAuthenticated: boolean;
  // ...
}
```

### 7.2 Permission Hook

**File:** `frontend/src/shared/hooks/usePermission.ts` (new)

```typescript
// src/shared/hooks/usePermission.ts
import { useAuth } from "@/hooks/useAuth";

export function usePermission(permission: string): boolean {
  const { subscription } = useAuth();
  const tier = subscription?.tier ?? "free";

  const PERMISSIONS: Record<string, Record<string, boolean>> = {
    // Mirror of backend PERMISSIONS matrix
    "finance_install": { free: false, paid: true },
    "calendar_install": { free: false, paid: true },
    // ...
  };

  return PERMISSIONS[permission]?.[tier] ?? false;
}
```

### 7.3 Billing Page

**File:** `frontend/src/pages/BillingPage.tsx` (new)

- Show current subscription tier + status
- "Upgrade to Paid" button → redirect to checkout
- Payment method selector (Stripe / PayOS)
- Cancel subscription option

---

## 8. Admin Page

### 8.1 Backend Admin API

**File:** `backend/apps/admin/routes.py` (new plugin)

Routes:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users (paginated) |
| PATCH | `/api/admin/users/{id}/role` | Promote/demote admin |
| GET | `/api/admin/subscriptions` | List subscriptions |
| PATCH | `/api/admin/subscriptions/{id}` | Update tier/status |
| GET | `/api/admin/apps` | List app catalog |
| PATCH | `/api/admin/apps/{id}` | Enable/disable app |
| GET | `/api/admin/stats` | Dashboard metrics |

All routes: `Depends(require_admin)` + `Depends(get_current_user)`.

### 8.2 Admin Page UI

**File:** `frontend/src/pages/AdminPage.tsx` (new)

```
┌──────────────────────────────────────────────────────────────┐
│  Admin                                                     │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────────┐   │
│  │ Users (12) │ │ Subscriptions │ │ App Catalog        │   │
│  └────────────┘ └──────────────┘ └────────────────────┘   │
│                                                              │
│  Tabs: Users | Subscriptions | Apps | Stats                 │
└──────────────────────────────────────────────────────────────┘
```

**Users Tab:**
- Table: Name, Email, Role, Subscription, Joined, Actions
- Actions: "Promote to Admin" / "Demote to User"
- Search by email

**Subscriptions Tab:**
- Table: User, Tier, Status, Provider, Started, Expires, Actions
- Actions: "Upgrade to Paid" / "Downgrade to Free" / "Cancel"
- Filter by status

**Apps Tab:**
- Grid/list of all installed apps
- Toggle: Enable / Disable
- View: Name, Required Tier, Install Count

**Stats Tab (minimal Phase 1):**
- Total users, active subscriptions, revenue summary

---

## 9. Subscription Activation Flow

### Stripe (Auto-renew)

```
User → POST /billing/checkout (stripe)
     → Stripe Checkout page
     → User pays → Stripe sends webhook
     → /webhook/stripe: checkout.session.completed
     → upsert Subscription (tier="paid", status="active", stripe_subscription_id)
     → User redirected to /billing/success
```

### PayOS (One-time, +30 days)

```
User → POST /billing/checkout (payos)
     → PayOS payment link created
     → User pays at bank app
     → /webhook/payos: payment success
     → upsert Subscription (tier="paid", status="active", expires_at = now + 30d)
     → Cron: daily check expires_at < now → status = "inactive"
```

### Cancellation

```
User → POST /billing/cancel
     → Stripe: cancel subscription (effective at period end)
     → PayOS: no action needed (expires_at handles it)
     → Update status to "cancelled"
```

---

## 10. New Files Summary

### Backend

```
backend/
├── core/
│   ├── auth.py                    # + require_admin, require_permission
│   └── models.py                  # + User.role field
├── shared/
│   ├── enums.py                   # + UserRole, SubscriptionTier, SubscriptionStatus, PaymentProvider
│   ├── schemas.py                 # + UserPublic.role, SubscriptionRead, UserWithSubscription
│   └── permissions.py             # NEW: PERMISSIONS matrix
└── apps/
    ├── billing/                   # NEW plugin
    │   ├── __init__.py            # register_plugin
    │   ├── manifest.py            # BillingAppManifest (requires_tier="free")
    │   ├── models.py              # Subscription document
    │   ├── schemas.py             # Billing request/response schemas
    │   ├── service.py             # Subscription business logic
    │   ├── routes.py               # checkout, webhook, subscription mgmt
    │   ├── providers/
    │   │   ├── base.py             # PaymentProvider ABC
    │   │   ├── stripe.py           # StripeProvider
    │   │   └── payos.py            # PayOSProvider
    │   └── agent.py                # Billing agent (optional)
    └── admin/                      # NEW plugin
        ├── __init__.py
        ├── manifest.py
        ├── routes.py               # Admin API routes
        ├── schemas.py
        └── service.py
```

### Frontend

```
frontend/src/
├── pages/
│   ├── AdminPage.tsx               # NEW: Admin management page
│   └── BillingPage.tsx             # NEW: User billing page
├── apps/
│   └── billing/
│       ├── AppView.tsx
│       └── BillingSuccessWidget.tsx
└── shared/
    └── hooks/
        └── usePermission.ts        # NEW: Permission check hook
```

---

## 11. Dependencies & Anti-Dependencies

**✅ OK (platform imports from apps):**
- `core/auth.py` imports `Subscription` (app model) — acceptable circular: auth → models → ok

**❌ NOT OK:**
- App không import từ `core/auth.py` (plugin chỉ dùng dependency injection từ route)
- `shared/permissions.py` không import từ bất kỳ app nào

---

## 12. DB Migration

Existing `users` collection cần migration:

```python
# Run once on startup or via migration script
async def migrate_add_role():
    await User.find_all().update({"$set": {"role": "user"}})
    await Subscription.find_all().update({"$set": {"tier": "free", "status": "inactive"}})
```

Index additions:
- `users.role` → index
- `subscriptions.user_id` → unique
- `subscriptions.provider + provider_subscription_id` → compound

---

## 13. Env Variables

```bash
# Backend .env
# ── Stripe ─────────────────────────
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=https://app.example.com/billing/success
STRIPE_CANCEL_URL=https://app.example.com/billing/cancel

# ── PayOS ──────────────────────────
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
PAYOS_WEBHOOK_SECRET=...
PAYOS_SUCCESS_URL=https://app.example.com/billing/success
PAYOS_CANCEL_URL=https://app.example.com/billing/cancel

# ── App defaults ───────────────────
FREE_TIER_APPS=todo,health2,chat
PAID_TIER_APPS=finance,calendar
DEFAULT_SUBSCRIPTION_TIER=free
```

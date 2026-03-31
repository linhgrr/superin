# Auth + Payment + Admin System Design

**Date:** 2026-03-31
**Status:** Approved

---

## Overview

Implement a full authorization, payment (PayOS + Stripe), and admin dashboard system for the SuperIn platform.

### Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Role model | `ADMIN` / `MEMBER` only | Simple, sufficient for MVP |
| Plan model | `PlanTier` + `BillingCycle` separate | Flexible — tier defines features, cycle defines billing |
| Payment gateway | Strategy pattern (interface + implementations) | Easy to add VNPay, ZaloPay later |
| PayOS | One-time links, manual renewal | PayOS has no auto-subscription |
| Stripe | Auto-renewing subscriptions | Stripe Billing handles recurring |
| Webhook security | Verify signature + server-side re-fetch | Per PCI best practices |
| Idempotency | `PaymentEvent` collection with `event_id` | Webhooks retry; must not process twice |

---

## Architecture

```
Frontend (React) ──JWT Bearer──▶ Backend (FastAPI)

Auth Layer:        JWT (access/refresh) | Role | PlanTier | BillingCycle
Admin Routes:      /admin/users | /admin/stats | /admin/subscriptions
Webhooks:          /webhooks/payos | /webhooks/stripe
SubscriptionService: business logic layer

Payment Gateway Layer (Strategy Pattern):
    PaymentGateway (interface)
        ├── PayOSGateway    (one-time, manual renewal, VND)
        └── StripeGateway  (auto-renew, multi-currency)

Database (MongoDB/Beanie):
    User (role, plan, billing_cycle, stripe_customer_id)
    Subscription (plan, billing_cycle, gateway, period)
    PaymentLink (orderCode, status)  ← PayOS
    PaymentEvent (event_id, processed)  ← idempotency
```

---

## Enums

```python
class Role(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"

class PlanTier(str, Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"

class BillingCycle(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"
```

---

## Database Models

### User (updated)
```python
class User(Document):
    email: str
    hashed_password: str
    name: str
    created_at: datetime
    settings: dict = {}
    role: Role = Role.MEMBER
    plan: PlanTier = PlanTier.FREE
    billing_cycle: BillingCycle | None = None
    stripe_customer_id: str | None = None
```

### Subscription
```python
class Subscription(Document):
    user_id: PydanticObjectId
    plan: PlanTier
    billing_cycle: BillingCycle
    gateway: Literal["payos", "stripe"]
    gateway_subscription_id: str | None = None
    status: Literal["active", "canceled", "past_due", "trialing"] = "active"
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
```

### PaymentLink (PayOS)
```python
class PaymentLink(Document):
    id: int | None = None          # orderCode (PayOS)
    user_id: PydanticObjectId
    plan: PlanTier
    billing_cycle: BillingCycle
    amount: int
    status: Literal["pending", "paid", "expired", "canceled"] = "pending"
    payment_link_id: str | None = None
    checkout_url: str | None = None
    created_at: datetime
    expires_at: datetime | None = None
    paid_at: datetime | None = None
```

### PaymentEvent (idempotency)
```python
class PaymentEvent(Document):
    event_id: str          # PayOS orderCode / Stripe event ID
    gateway: Literal["payos", "stripe"]
    event_type: str
    processed: bool = False
    processed_at: datetime | None = None
    payload: dict
```

---

## Pricing

### VND (PayOS)
| Tier \ Cycle | Weekly | Monthly | Yearly |
|---|---|---|---|
| STARTER | 29,000đ | 89,000đ | 799,000đ |
| PRO | 59,000đ | 179,000đ | 1,599,000đ |

### USD (Stripe — cents)
| Tier \ Cycle | Weekly | Monthly | Yearly |
|---|---|---|---|
| STARTER | $1.99 | $5.99 | $54.99 |
| PRO | $3.99 | $11.99 | $109.99 |

### Period Days
```python
PERIOD_DAYS = {WEEKLY: 7, MONTHLY: 30, YEARLY: 365}
```

---

## Payment Gateway Interface

```python
# backend/core/payment/interfaces.py

class PaymentGateway(ABC):
    @property
    @abstractmethod
    def gateway_name(self) -> Literal["stripe", "payos"]: ...

    @abstractmethod
    async def create_payment_link(...): ...

    @abstractmethod
    async def get_payment_link(self, link_id: str) -> PaymentLinkInfo: ...

    @abstractmethod
    async def cancel_payment_link(self, link_id: str) -> PaymentLinkInfo: ...

    @abstractmethod
    async def create_subscription(user_id, plan, email, name) -> SubscriptionInfo: ...

    @abstractmethod
    async def get_subscription(self, gateway_id: str) -> SubscriptionInfo: ...

    @abstractmethod
    async def cancel_subscription(self, gateway_id: str) -> SubscriptionInfo: ...

    @abstractmethod
    async def verify_webhook(self, raw_body: bytes, headers: dict) -> WebhookResult: ...

    @abstractmethod
    async def get_payment_link_by_order_code(self, order_code: int) -> PaymentLinkInfo | None:
        """PayOS only. Stripe raises NotImplementedError."""
        raise NotImplementedError()
```

### Key Implementation Notes

- **Stripe SDK** is synchronous → all calls wrapped in `asyncio.to_thread(functools.partial(fn, ...))`
- **PayOS httpx client** managed by FastAPI lifespan via `app.state.payos_client` — injected into `PayOSGateway(client=...)`
- **Stripe `get_payment_link_by_order_code`** raises `NotImplementedError` — must store `link_id` in DB at creation and lookup from there
- **`PaymentGatewayError`** has `retryable: bool` flag for caller retry logic

---

## Webhook Security (per payment-integration skill)

1. **Return 2xx within 200ms** — before any expensive operations
2. **Idempotency** — check `PaymentEvent.event_id` before processing
3. **Server-side verify** — re-fetch payment status from gateway API (never trust webhook payload alone)
4. **Stripe webhook** — verify signature with `stripe_lib.webhook.construct_event`
5. **PayOS webhook** — verify HMAC_SHA256 signature from body

---

## Frontend Feature Gating

```tsx
<FeatureGate requiredPlans={[PlanTier.PRO]}>
  <AdvancedWidget />
</FeatureGate>
```

`FeatureGate` compares tier index: `FREE(0) < STARTER(1) < PRO(2)`.

---

## Cron Jobs (Celery)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `notify_expiring` | Daily 9AM VN | Email users 3 days before renewal |
| `downgrade_expired` | Daily 00:05 VN | Revert canceled/expired subs to FREE |

---

## Admin Pages

| Route | Purpose |
|-------|---------|
| `/admin` | Stats dashboard — total users, active subs, revenue |
| `/admin/users` | List/filter/promote/delete users |
| `/admin/subscriptions` | List/filter subscriptions by plan, status |
| `/admin/payments` | Payment event log for debugging |
| `/admin/app-store` | Manage app catalog (existing) |
| `/admin/settings` | Platform settings |

All admin routes protected by `@require_admin` decorator.

---

## Files to Create

```
backend/
  core/
    payment/
      __init__.py
      interfaces.py
      exceptions.py      # PaymentGatewayError
      payos.py          # PayOSGateway
      stripe.py         # StripeGateway
      factory.py        # get_gateway(), get_payos_gateway()
      service.py        # SubscriptionService
    auth/
      decorators.py     # @require_admin, @require_role()
    models.py            # Role, PlanTier, BillingCycle, Subscription, PaymentLink, PaymentEvent
  apps/
    admin.py             # Admin routes + pricing config
    webhooks.py          # /webhooks/payos, /webhooks/stripe
    cron.py              # Celery tasks
frontend/
  src/
    app/
      admin/
        layout.tsx
        page.tsx         # Stats dashboard
        users/page.tsx
        subscriptions/page.tsx
        payments/page.tsx
        _components/
          Sidebar.tsx
    components/
      FeatureGate.tsx
```

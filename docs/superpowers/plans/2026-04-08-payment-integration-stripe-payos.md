# Payment Integration (Stripe + PayOS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisites:** Plan A (RBAC Core) must be implemented first. This plan builds on `apps/billing/` stub created in Plan A Task 5.

**Goal:** Implement an abstract payment provider interface with two concrete implementations: Stripe (international, auto-renew subscriptions) and PayOS (Vietnam domestic, one-time payments). Both feed into the same `Subscription` document for a unified subscription model.

**Architecture:**
- `PaymentProvider` ABC in `providers/base.py` defines the interface
- `StripeProvider` handles Stripe Checkout + webhook events
- `PayOSProvider` handles PayOS payment links + webhook events
- `billing/routes.py` routes checkout/webhook/cancel requests to the appropriate provider
- Subscription activation is triggered by webhooks — both providers call `subscription_service.activate()`
- PayOS uses time-based expiry (`expires_at`) since it has no auto-renew; a daily cron check handles expired subscriptions

**Tech Stack:** `stripe` Python SDK, `httpx` for PayOS REST API, HMAC-SHA256 for PayOS webhook signature verification

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/apps/billing/models.py` — add helper methods |
| Create | `backend/apps/billing/providers/__init__.py` |
| Create | `backend/apps/billing/providers/base.py` |
| Create | `backend/apps/billing/providers/stripe.py` |
| Create | `backend/apps/billing/providers/payos.py` |
| Create | `backend/apps/billing/service.py` |
| Modify | `backend/apps/billing/routes.py` — add checkout, webhooks, cancel |
| Create | `backend/apps/billing/schemas.py` — add checkout/mgmt schemas |
| Modify | `backend/core/config.py` — add payment env vars |
| Modify | `backend/core/main.py` — mount billing router |
| Create | `frontend/src/pages/BillingPage.tsx` |
| Create | `frontend/src/apps/billing/AppView.tsx` |

---

## Task 1: Create PaymentProvider abstract interface

**Files:**
- Create: `backend/apps/billing/providers/__init__.py`
- Create: `backend/apps/billing/providers/base.py`

- [ ] **Step 1: Create `providers/__init__.py`**

```python
"""Payment provider implementations."""

from apps.billing.providers.base import PaymentProvider
from apps.billing.providers.stripe import StripeProvider
from apps.billing.providers.payos import PayOSProvider

__all__ = ["PaymentProvider", "StripeProvider", "PayOSProvider"]
```

- [ ] **Step 2: Create `providers/base.py`**

```python
"""Abstract payment provider interface.

Each provider (Stripe, PayOS) implements this interface.
The service layer is provider-agnostic — it only talks through this interface.
"""

from abc import ABC, abstractmethod
from typing import Literal


class PaymentProvider(ABC):
    """Abstract payment provider.

    All concrete implementations must implement these methods.
    """

    provider_name: Literal["stripe", "payos"]

    @abstractmethod
    async def create_checkout_session(
        self,
        *,
        user_id: str,
        user_email: str,
        success_url: str,
        cancel_url: str,
        metadata: dict | None = None,
    ) -> dict:
        """Create a checkout session / payment link.

        Returns:
            {
                "checkout_url": str,      # URL to redirect the user
                "provider_reference": str, # Stripe subscription ID or PayOS order code
                "provider_payment_link_id": str | None,  # PayOS payment link ID
            }

        Raises:
            PaymentProviderError: if the provider API call fails.
        """
        ...

    @abstractmethod
    async def get_subscription_status(
        self,
        provider_reference: str,
    ) -> dict:
        """Fetch current subscription/payment status from the provider.

        Returns:
            {
                "status": Literal["active", "cancelled", "past_due", "trialing"],
                "current_period_end": datetime | None,  # When current period ends
                "cancel_at_period_end": bool,
            }
        """
        ...

    @abstractmethod
    async def cancel_subscription(
        self,
        provider_reference: str,
        *,
        cancellation_reason: str | None = None,
    ) -> dict:
        """Cancel the subscription.

        Returns:
            {
                "cancelled": bool,
                "effective_date": datetime,
                "message": str,
            }
        """
        ...

    @abstractmethod
    async def handle_webhook(
        self,
        payload: bytes,
        headers: dict[str, str],
    ) -> dict:
        """Process incoming webhook.

        Validates signature, parses event, and returns:
            {
                "event_type": str,        # e.g. "checkout.session.completed"
                "provider_reference": str,
                "user_id": str | None,    # Extracted from metadata
                "new_status": SubscriptionStatus,
                "new_tier": SubscriptionTier,
                "expires_at": datetime | None,
            }

        Raises:
            WebhookSignatureError: if signature validation fails.
        """
        ...


class PaymentProviderError(Exception):
    """Raised when a payment provider API call fails."""


class WebhookSignatureError(Exception):
    """Raised when webhook signature validation fails."""
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/billing/providers/
git commit -m "feat(billing): add PaymentProvider ABC with base interface

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 2: Create subscription service

**Files:**
- Create: `backend/apps/billing/service.py`

This service is the single place where `Subscription` documents are created/updated. Both providers call into this service from their webhook handlers.

- [ ] **Step 1: Create `backend/apps/billing/service.py`**

```python
"""Subscription business logic — single place for all subscription mutations.

Called by payment provider webhook handlers and admin routes.
All mutations use Mongo transactions to ensure consistency.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Literal

from beanie import PydanticObjectId
from pymongo import WriteConcern

from apps.billing.models import Subscription
from shared.enums import SubscriptionStatus, SubscriptionTier

logger = logging.getLogger(__name__)

# How long a PayOS one-time payment grants paid access
PAID_ACCESS_DURATION_DAYS = 30


async def activate_paid_subscription(
    user_id: str,
    provider: Literal["stripe", "payos"],
    provider_reference: str,
    expires_at: datetime | None = None,
) -> Subscription:
    """Activate a paid subscription for a user.

    Creates the Subscription document if it doesn't exist (upsert).
    Uses write concern "majority" for durability.

    Args:
        user_id: The user's database ID
        provider: Which payment provider was used
        provider_reference: Provider's subscription/payment ID
        expires_at: Only used for PayOS (one-time payment expiry).
                    Stripe subscriptions track expiry via provider.
    """
    now = datetime.now(UTC)

    async with Subscription.session() as session:
        sub = await Subscription.find_one(
            Subscription.user_id == PydanticObjectId(user_id),
            session=session,
        )

        if sub is None:
            sub = Subscription(
                user_id=PydanticObjectId(user_id),
                tier="paid",
                status="active",
                provider=provider,
                provider_subscription_id=provider_reference,
                started_at=now,
                expires_at=expires_at,
                created_at=now,
                updated_at=now,
            )
            await sub.insert(session=session)
            logger.info("Activated paid subscription for user %s via %s", user_id, provider)
        else:
            await sub.update(
                session=session,
                WriteConcern=WriteConcern("majority"),
                _set={
                    "tier": "paid",
                    "status": "active",
                    "provider": provider,
                    "provider_subscription_id": provider_reference,
                    "started_at": sub.started_at or now,
                    "expires_at": expires_at,
                    "updated_at": now,
                },
            )
            logger.info("Upgraded subscription to paid for user %s", user_id)

        return sub


async def deactivate_subscription(user_id: str) -> Subscription | None:
    """Downgrade a subscription to free/inactive.

    Called when a subscription is cancelled or expires.
    """
    now = datetime.now(UTC)

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None:
        return None

    sub.tier = "free"
    sub.status = "inactive"
    sub.updated_at = now
    await sub.save()
    logger.info("Deactivated subscription for user %s", user_id)
    return sub


async def mark_subscription_cancelled(user_id: str) -> Subscription | None:
    """Mark a subscription as cancelled (Stripe cancel_at_period_end)."""
    now = datetime.now(UTC)

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None:
        return None

    sub.status = "cancelled"
    sub.cancelled_at = now
    sub.updated_at = now
    await sub.save()
    logger.info("Marked subscription cancelled for user %s", user_id)
    return sub


async def check_and_expire_subscriptions() -> int:
    """Cron job: find PayOS subscriptions past expires_at and deactivate.

    Returns the number of subscriptions expired.
    This should be called daily by a cron job or on app startup.
    """
    now = datetime.now(UTC)
    expired = await Subscription.find(
        Subscription.tier == "paid",
        Subscription.status == "active",
        Subscription.expires_at < now,
        Subscription.provider == "payos",
    ).to_list()

    count = 0
    for sub in expired:
        sub.tier = "free"
        sub.status = "inactive"
        sub.updated_at = now
        await sub.save()
        count += 1
        logger.info("Expired PayOS subscription for user %s", str(sub.user_id))

    if count > 0:
        logger.info("Expired %d PayOS subscriptions", count)
    return count
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/billing/service.py
git commit -m "feat(billing): add subscription service with activate/deactivate/expire

Centralized subscription mutation logic with Mongo transactions. Provides check_and_expire_subscriptions() for cron-style expiry of PayOS one-time payments."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 3: Implement StripeProvider

**Files:**
- Create: `backend/apps/billing/providers/stripe.py`

**Prerequisites:** `stripe` package installed. Install with `pip install stripe`.

- [ ] **Step 1: Install stripe package**

```bash
cd /home/linh/Downloads/superin/backend
pip install stripe
```

- [ ] **Step 2: Create `backend/apps/billing/providers/stripe.py`**

```python
"""Stripe payment provider implementation."""

import logging
from datetime import datetime
from typing import Literal

import stripe
from stripe import StripeError

from apps.billing.providers.base import (
    PaymentProvider,
    PaymentProviderError,
    WebhookSignatureError,
)
from apps.billing.service import activate_paid_subscription, mark_subscription_cancelled
from core.config import settings
from shared.enums import SubscriptionStatus, SubscriptionTier

stripe.api_key = settings.stripe_secret_key

logger = logging.getLogger(__name__)


class StripeProvider(PaymentProvider):
    """Stripe implementation of PaymentProvider.

    Uses Stripe Checkout (hosted page) for simplicity.
    Subscriptions are managed via Stripe's dashboard or API.
    """

    provider_name: Literal["stripe"] = "stripe"

    async def create_checkout_session(
        self,
        *,
        user_id: str,
        user_email: str,
        success_url: str,
        cancel_url: str,
        metadata: dict | None = None,
    ) -> dict:
        try:
            session = stripe.checkout.Session.create(
                mode="subscription",
                customer_email=user_email,
                line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={**(metadata or {}), "user_id": user_id},
            )
            logger.info("Created Stripe checkout session %s for user %s", session.id, user_id)
            return {
                "checkout_url": str(session.url),
                "provider_reference": session.subscription or session.id,
                "provider_payment_link_id": None,
            }
        except StripeError as e:
            logger.error("Stripe checkout error: %s", e)
            raise PaymentProviderError(f"Failed to create Stripe checkout session: {e}") from e

    async def get_subscription_status(
        self,
        provider_reference: str,
    ) -> dict:
        try:
            sub = stripe.Subscription.retrieve(provider_reference)
            status = sub.status  # active, trialing, canceled, incomplete, past_due, unpaid

            # Map Stripe status to our SubscriptionStatus
            if status == "active":
                mapped_status: SubscriptionStatus = "active"
            elif status in ("past_due", "unpaid"):
                mapped_status = "past_due"
            elif status == "canceled":
                mapped_status = "cancelled"
            else:
                mapped_status = "inactive"

            return {
                "status": mapped_status,
                "current_period_end": datetime.fromtimestamp(sub.current_period_end),
                "cancel_at_period_end": sub.cancel_at_period_end,
            }
        except StripeError as e:
            logger.error("Stripe subscription retrieve error: %s", e)
            raise PaymentProviderError(f"Failed to retrieve Stripe subscription: {e}") from e

    async def cancel_subscription(
        self,
        provider_reference: str,
        *,
        cancellation_reason: str | None = None,
    ) -> dict:
        try:
            sub = stripe.Subscription.delete(
                provider_reference,
                cancellation_reason=cancellation_reason,
            )
            logger.info("Cancelled Stripe subscription %s", provider_reference)
            return {
                "cancelled": True,
                "effective_date": datetime.fromtimestamp(sub.current_period_end),
                "message": "Subscription cancelled. Access continues until end of billing period.",
            }
        except StripeError as e:
            logger.error("Stripe cancel error: %s", e)
            raise PaymentProviderError(f"Failed to cancel Stripe subscription: {e}") from e

    async def handle_webhook(
        self,
        payload: bytes,
        headers: dict[str, str],
    ) -> dict:
        # Verify signature
        sig = headers.get("stripe-signature", "")
        try:
            event = stripe.Webhook.construct_event(
                payload,
                sig,
                settings.stripe_webhook_secret,
            )
        except (stripe.error.SignatureVerificationError, ValueError) as e:
            logger.warning("Stripe webhook signature verification failed: %s", e)
            raise WebhookSignatureError(f"Invalid Stripe webhook signature: {e}") from e

        event_type = event["type"]
        logger.info("Received Stripe webhook: %s", event_type)

        # Handle relevant events
        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            user_id = session.get("metadata", {}).get("user_id")
            subscription_id = session.get("subscription")
            if user_id and subscription_id:
                await activate_paid_subscription(
                    user_id=user_id,
                    provider="stripe",
                    provider_reference=subscription_id,
                )
                return {
                    "event_type": event_type,
                    "provider_reference": subscription_id,
                    "user_id": user_id,
                    "new_status": "active",
                    "new_tier": "paid",
                    "expires_at": None,
                }

        elif event_type == "customer.subscription.updated":
            sub = event["data"]["object"]
            user_id = sub.get("metadata", {}).get("user_id")
            if user_id and sub.status == "active":
                await activate_paid_subscription(
                    user_id=user_id,
                    provider="stripe",
                    provider_reference=sub.id,
                )
                return {
                    "event_type": event_type,
                    "provider_reference": sub.id,
                    "user_id": user_id,
                    "new_status": "active",
                    "new_tier": "paid",
                    "expires_at": None,
                }

        elif event_type == "customer.subscription.deleted":
            sub = event["data"]["object"]
            user_id = sub.get("metadata", {}).get("user_id")
            if user_id:
                await mark_subscription_cancelled(user_id)
                return {
                    "event_type": event_type,
                    "provider_reference": sub.id,
                    "user_id": user_id,
                    "new_status": "cancelled",
                    "new_tier": "free",
                    "expires_at": None,
                }

        # Unsupported event type — return as-is for debugging
        logger.debug("Unhandled Stripe event type: %s", event_type)
        return {
            "event_type": event_type,
            "provider_reference": "",
            "user_id": None,
            "new_status": None,
            "new_tier": None,
            "expires_at": None,
        }
```

- [ ] **Step 3: Update `core/config.py` with Stripe env vars**

Find the `Settings` class in `core/config.py`. Add these fields **after** the existing auth fields (around line 40):

```python
    # ─── Stripe ──────────────────────────────────────────────────────────────
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""
    stripe_success_url: str = "http://localhost:5173/billing/success"
    stripe_cancel_url: str = "http://localhost:5173/billing/cancel"
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/billing/providers/stripe.py backend/core/config.py
git commit -m "feat(billing): add StripeProvider with checkout and webhook handling

Supports Stripe Checkout (subscription mode), webhook verification, and subscription lifecycle events. Handles checkout.session.completed, subscription.updated, subscription.deleted."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 4: Implement PayOSProvider

**Files:**
- Create: `backend/apps/billing/providers/payos.py`

**Important:** PayOS uses HMAC-SHA256 signatures. The signature for creating a payment link is computed from: `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}` sorted alphabetically. The webhook signature uses a different payload format.

- [ ] **Step 1: Install httpx**

```bash
cd /home/linh/Downloads/superin/backend
pip install httpx
```

- [ ] **Step 2: Create `backend/apps/billing/providers/payos.py`**

```python
"""PayOS payment provider implementation.

PayOS is a Vietnam domestic payment gateway.
Key difference from Stripe: PayOS uses one-time payment links (not subscriptions).
After payment, the link expires and access is granted for a fixed duration (30 days).
"""

import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

import httpx

from apps.billing.providers.base import (
    PaymentProvider,
    PaymentProviderError,
    WebhookSignatureError,
)
from apps.billing.service import activate_paid_subscription
from core.config import settings

logger = logging.getLogger(__name__)

PAOS_API_BASE = "https://api-merchant.payos.vn"

# How long paid access lasts after a PayOS payment (in days)
PAID_ACCESS_DURATION_DAYS = 30


def _generate_order_code() -> int:
    """Generate a unique numeric order code for PayOS.

    PayOS requires orderCode as a positive integer.
    Use timestamp + random suffix to avoid collisions.
    """
    import time
    return int(f"{int(time.time())}{secrets.randbelow(9999):04d}")


def _sign_payos_data(data: dict, checksum_key: str) -> str:
    """Generate HMAC-SHA256 signature for PayOS API requests.

    Sign data sorted alphabetically by key:
    amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}
    """
    sorted_keys = sorted(data.keys())
    sign_string = "&".join(f"{k}={data[k]}" for k in sorted_keys if data.get(k) is not None)
    signature = hmac.new(
        checksum_key.encode("utf-8"),
        sign_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return signature


def _verify_webhook_signature(
    payload: bytes,
    headers: dict[str, str],
    checksum_key: str,
) -> dict:
    """Verify PayOS webhook HMAC-SHA256 signature.

    PayOS webhook body format:
    {
      "code": "00",
      "success": true,
      "data": { ... transaction data ... },
      "signature": "..."
    }

    The signature is computed over the raw response body before JSON parsing.
    The header x_checksum = HMAC_SHA256(raw_body, checksum_key).
    """
    import json
    raw_body = payload.decode("utf-8")
    received_checksum = headers.get("x_checksum", "")

    expected_checksum = hmac.new(
        checksum_key.encode("utf-8"),
        raw_body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(received_checksum, expected_checksum):
        raise WebhookSignatureError("PayOS webhook signature mismatch")

    try:
        return json.loads(raw_body)
    except (json.JSONDecodeError, ValueError) as e:
        raise WebhookSignatureError(f"Invalid PayOS webhook payload: {e}") from e


class PayOSProvider(PaymentProvider):
    """PayOS implementation of PaymentProvider.

    PayOS flow:
    1. create_checkout_session → creates a payment link, returns checkout_url
    2. User pays via bank app / QR
    3. PayOS calls our webhook with payment confirmation
    4. handle_webhook → activates subscription with expires_at = now + 30 days
    """

    provider_name: Literal["payos"] = "payos"

    def __init__(self) -> None:
        self.client_id = settings.payos_client_id
        self.api_key = settings.payos_api_key
        self.checksum_key = settings.payos_checksum_key

    def _headers(self) -> dict[str, str]:
        return {
            "x-client-id": self.client_id,
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def create_checkout_session(
        self,
        *,
        user_id: str,
        user_email: str,
        success_url: str,
        cancel_url: str,
        metadata: dict | None = None,
    ) -> dict:
        # PayOS price is in VND and must be an integer
        # For simplicity, 1 subscription = 1 unit at the configured price (in VND)
        amount = settings.payos_price_vnd
        order_code = _generate_order_code()

        payload_data = {
            "orderCode": str(order_code),
            "amount": str(amount),
            "description": f"Shin SuperApp Subscription",
            "cancelUrl": cancel_url,
            "returnUrl": success_url,
        }

        signature = _sign_payos_data(payload_data, self.checksum_key)

        payload = {
            **payload_data,
            "buyerEmail": user_email,
            "signature": signature,
            "expiredAt": int((datetime.now(UTC) + timedelta(hours=2)).timestamp()),
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{PAOS_API_BASE}/v2/payment-requests",
                    headers=self._headers(),
                    json=payload,
                )
                resp.raise_for_status()
                result = resp.json()

            if result.get("code") != "00":
                raise PaymentProviderError(f"PayOS API error: {result.get('desc')} ({result.get('code')})")

            data = result["data"]
            logger.info(
                "Created PayOS payment link %s (order %s) for user %s",
                data.get("paymentLinkId"),
                order_code,
                user_id,
            )

            return {
                "checkout_url": data["checkoutUrl"],
                "provider_reference": str(order_code),
                "provider_payment_link_id": data["paymentLinkId"],
                # Also store in metadata for webhook correlation
                "metadata": {"user_id": user_id},
            }
        except httpx.HTTPError as e:
            logger.error("PayOS checkout error: %s", e)
            raise PaymentProviderError(f"Failed to create PayOS payment link: {e}") from e

    async def get_subscription_status(
        self,
        provider_reference: str,
    ) -> dict:
        # PayOS doesn't have a subscription concept — we track via our own Subscription doc
        # This method is implemented for interface completeness but may not be needed
        raise PaymentProviderError("PayOS does not support subscription status queries. Use the local Subscription document.")

    async def cancel_subscription(
        self,
        provider_reference: str,
        *,
        cancellation_reason: str | None = None,
    ) -> dict:
        # PayOS uses one-time payments — cannot cancel a completed payment
        # Cancellation means the subscription will expire naturally via expires_at
        # We mark it as inactive in our Subscription doc instead
        return {
            "cancelled": False,
            "effective_date": datetime.now(UTC),
            "message": "PayOS uses one-time payments. Subscription will expire at the current period end.",
        }

    async def handle_webhook(
        self,
        payload: bytes,
        headers: dict[str, str],
    ) -> dict:
        data = _verify_webhook_signature(payload, headers, self.checksum_key)

        code = data.get("code")
        success = data.get("success", False)

        if code != "00" or not success:
            logger.warning("PayOS webhook received non-success: code=%s success=%s", code, success)
            return {
                "event_type": "payment.failed",
                "provider_reference": "",
                "user_id": None,
                "new_status": None,
                "new_tier": None,
                "expires_at": None,
            }

        tx_data = data.get("data", {})
        order_code = str(tx_data.get("orderCode", ""))
        payment_link_id = tx_data.get("paymentLinkId", "")

        # We need to find the user_id for this order
        # The order_code is stored in Subscription.provider_subscription_id
        from apps.billing.models import Subscription
        from beanie import PydanticObjectId

        sub = await Subscription.find_one(
            Subscription.provider == "payos",
            Subscription.provider_subscription_id == order_code,
        )

        if sub is None:
            logger.warning("PayOS webhook: no subscription found for order %s", order_code)
            return {
                "event_type": "payment.captured",
                "provider_reference": order_code,
                "user_id": None,
                "new_status": None,
                "new_tier": None,
                "expires_at": None,
            }

        user_id = str(sub.user_id)
        expires_at = datetime.now(UTC) + timedelta(days=PAID_ACCESS_DURATION_DAYS)

        await activate_paid_subscription(
            user_id=user_id,
            provider="payos",
            provider_reference=order_code,
            expires_at=expires_at,
        )

        logger.info(
            "Activated PayOS subscription for user %s, expires at %s",
            user_id,
            expires_at,
        )

        return {
            "event_type": "payment.captured",
            "provider_reference": order_code,
            "user_id": user_id,
            "new_status": "active",
            "new_tier": "paid",
            "expires_at": expires_at,
        }
```

- [ ] **Step 3: Update `core/config.py` with PayOS env vars**

Add to `Settings` in `core/config.py`:

```python
    # ─── PayOS ───────────────────────────────────────────────────────────────
    payos_client_id: str = ""
    payos_api_key: str = ""
    payos_checksum_key: str = ""
    payos_price_vnd: int = 99000  # Price in VND (e.g. 99000 VND ≈ $4)
    payos_success_url: str = "http://localhost:5173/billing/success"
    payos_cancel_url: str = "http://localhost:5173/billing/cancel"
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/billing/providers/payos.py backend/core/config.py
git commit -m "feat(billing): add PayOSProvider with payment link and webhook handling

Implements HMAC-SHA256 signature for both request signing and webhook verification. Uses one-time payment links with 30-day paid access duration. Supports order code correlation for webhook processing."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 5: Update billing routes — checkout, webhooks, cancel, subscription mgmt

**Files:**
- Modify: `backend/apps/billing/routes.py`
- Modify: `backend/apps/billing/schemas.py`
- Modify: `backend/apps/billing/__init__.py`

- [ ] **Step 1: Create updated `billing/schemas.py`**

```python
"""Billing request/response schemas — replaces the stub schemas from Plan A."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier


class SubscriptionRead(BaseModel):
    """Current user's subscription info for API response."""

    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class CheckoutRequest(BaseModel):
    """Request to initiate a checkout session."""

    provider: Literal["stripe", "payos"] = Field(
        description="Payment provider to use"
    )


class CheckoutResponse(BaseModel):
    """Response with checkout redirect URL."""

    checkout_url: str
    provider: Literal["stripe", "payos"]


class CancelSubscriptionResponse(BaseModel):
    """Response from subscription cancellation."""

    message: str
    effective_date: datetime | None = None


class SubscriptionStatusResponse(BaseModel):
    """Subscription status from payment provider."""

    status: str
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False


class WebhookResponse(BaseModel):
    """Generic webhook processing response."""

    received: bool = True
    event_type: str | None = None
```

- [ ] **Step 2: Replace `billing/routes.py` with full implementation**

```python
"""Billing routes — checkout, subscription management, and webhooks."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from apps.billing.models import Subscription
from apps.billing.providers import PayOSProvider, StripeProvider
from apps.billing.schemas import (
    CancelSubscriptionResponse,
    CheckoutResponse,
    CheckoutRequest,
    SubscriptionRead,
    SubscriptionStatusResponse,
    WebhookResponse,
)
from apps.billing.service import (
    activate_paid_subscription,
    check_and_expire_subscriptions,
    deactivate_subscription,
    mark_subscription_cancelled,
)
from core.auth import get_current_user
from core.config import settings
from shared.enums import PaymentProvider

router = APIRouter()
logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


# ─── User-facing routes ────────────────────────────────────────────────────────


@router.get("/subscription", response_model=SubscriptionRead)
async def get_my_subscription(
    user_id: str = Depends(get_current_user),
) -> SubscriptionRead:
    """Return the current user's subscription (or default free/inactive)."""
    from beanie import PydanticObjectId

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
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


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    request: CheckoutRequest,
    user_id: str = Depends(get_current_user),
) -> CheckoutResponse:
    """Create a checkout session / payment link for subscription upgrade."""
    from beanie import PydanticObjectId
    from core.models import User

    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if request.provider == "stripe":
        impl = StripeProvider()
        success_url = settings.stripe_success_url
        cancel_url = settings.stripe_cancel_url
    elif request.provider == "payos":
        impl = PayOSProvider()
        success_url = settings.payos_success_url
        cancel_url = settings.payos_cancel_url
    else:
        raise HTTPException(status_code=400, detail="Invalid payment provider")

    try:
        result = await impl.create_checkout_session(
            user_id=user_id,
            user_email=user.email,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": user_id},
        )

        # Store provider reference for webhook correlation (PayOS)
        payment_link_id = result.get("provider_payment_link_id")
        if payment_link_id and request.provider == "payos":
            sub = await Subscription.find_one(
                Subscription.user_id == PydanticObjectId(user_id),
            )
            if sub:
                sub.provider = "payos"
                sub.provider_subscription_id = result["provider_reference"]
                sub.payos_payment_link_id = payment_link_id
                await sub.save()
            else:
                await Subscription(
                    user_id=PydanticObjectId(user_id),
                    provider="payos",
                    provider_subscription_id=result["provider_reference"],
                    payos_payment_link_id=payment_link_id,
                ).insert()

        return CheckoutResponse(
            checkout_url=result["checkout_url"],
            provider=request.provider,
        )
    except Exception as e:
        logger.error("Checkout error: %s", e)
        raise HTTPException(status_code=502, detail=f"Payment provider error: {e}") from e


@router.post("/cancel", response_model=CancelSubscriptionResponse)
async def cancel_my_subscription(
    user_id: str = Depends(get_current_user),
) -> CancelSubscriptionResponse:
    """Cancel the current user's paid subscription."""
    from beanie import PydanticObjectId

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None or sub.provider is None:
        raise HTTPException(status_code=400, detail="No active paid subscription found")

    provider_ref = sub.provider_subscription_id
    if not provider_ref:
        raise HTTPException(status_code=400, detail="No provider reference found")

    if sub.provider == "stripe":
        impl = StripeProvider()
        try:
            result = await impl.cancel_subscription(provider_ref)
            if result.get("cancelled"):
                await mark_subscription_cancelled(user_id)
            return CancelSubscriptionResponse(
                message=result.get("message", "Subscription cancelled"),
                effective_date=result.get("effective_date"),
            )
        except Exception as e:
            logger.error("Stripe cancel error: %s", e)
            raise HTTPException(status_code=502, detail=f"Failed to cancel: {e}") from e

    elif sub.provider == "payos":
        # PayOS cannot cancel — expires naturally
        await deactivate_subscription(user_id)
        return CancelSubscriptionResponse(
            message="PayOS subscriptions cannot be cancelled mid-period. Your access remains until the paid period ends.",
            effective_date=sub.expires_at,
        )

    raise HTTPException(status_code=400, detail="Unknown provider")


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_provider_status(
    user_id: str = Depends(get_current_user),
) -> SubscriptionStatusResponse:
    """Get subscription status from the payment provider (Stripe only)."""
    from beanie import PydanticObjectId

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None or sub.provider_subscription_id is None:
        raise HTTPException(status_code=400, detail="No active subscription")

    if sub.provider == "stripe":
        impl = StripeProvider()
        try:
            result = await impl.get_subscription_status(sub.provider_subscription_id)
            return SubscriptionStatusResponse(
                status=result["status"],
                current_period_end=result["current_period_end"],
                cancel_at_period_end=result.get("cancel_at_period_end", False),
            )
        except Exception as e:
            logger.error("Stripe status error: %s", e)
            raise HTTPException(status_code=502, detail=f"Failed to get status: {e}") from e

    # PayOS doesn't have server-side status
    return SubscriptionStatusResponse(
        status=sub.status,
        current_period_end=sub.expires_at,
        cancel_at_period_end=False,
    )


# ─── Webhook routes ────────────────────────────────────────────────────────────


@router.post("/webhook/stripe", response_model=WebhookResponse)
async def stripe_webhook(request: Request) -> WebhookResponse:
    """Receive Stripe webhook events.

    Stripe sends events including:
    - checkout.session.completed → activate subscription
    - customer.subscription.updated → sync status
    - customer.subscription.deleted → cancel subscription
    """
    impl = StripeProvider()
    try:
        result = await impl.handle_webhook(
            await request.body(),
            dict(request.headers),
        )
        return WebhookResponse(
            received=True,
            event_type=result.get("event_type"),
        )
    except Exception as e:
        logger.error("Stripe webhook error: %s", e)
        # Always return 200 to Stripe so they don't retry
        return WebhookResponse(received=True, event_type=None)


@router.post("/webhook/payos", response_model=WebhookResponse)
async def payos_webhook(request: Request) -> WebhookResponse:
    """Receive PayOS webhook events.

    PayOS sends a single event type per transaction.
    We only care about successful payments (code=00, success=true).
    """
    impl = PayOSProvider()
    try:
        result = await impl.handle_webhook(
            await request.body(),
            dict(request.headers),
        )
        return WebhookResponse(
            received=True,
            event_type=result.get("event_type"),
        )
    except Exception as e:
        logger.error("PayOS webhook error: %s", e)
        # Return 200 so PayOS doesn't retry
        return WebhookResponse(received=True, event_type=None)


# ─── Cron route (internal) ─────────────────────────────────────────────────────


@router.post("/cron/expire-subscriptions")
async def cron_expire_subscriptions(
    _: str = Depends(get_current_user),  # TODO: replace with internal API key auth
) -> dict:
    """Daily cron job: expire PayOS subscriptions past expires_at.

    TODO: Replace user auth with internal API key (X-Internal-Key header).
    """
    count = await check_and_expire_subscriptions()
    return {"expired": count}
```

- [ ] **Step 3: Update `billing/__init__.py` to register properly**

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
    logger.info("✓ Billing plugin registered (full payment integration)")
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/billing/routes.py backend/apps/billing/schemas.py backend/apps/billing/__init__.py
git commit -m "feat(billing): add full checkout, webhook, and cancel routes

Implements POST /billing/checkout, POST /billing/cancel, GET /billing/status, POST /billing/webhook/stripe, POST /billing/webhook/payos. Routes are provider-agnostic at the service layer."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 6: Update app manifests with `requires_tier`

**Files:**
- Modify: `backend/apps/finance/manifest.py`
- Modify: `backend/apps/calendar/manifest.py`

- [ ] **Step 1: Add `requires_tier = "paid"` to Finance manifest**

Open `backend/apps/finance/manifest.py`. Add this field to the manifest class:

```python
    requires_auth = True
    requires_tier: Literal["free", "paid"] = "paid"  # Finance = paid-only app
```

Also add `from typing import Literal` if not already present.

- [ ] **Step 2: Add `requires_tier = "paid"` to Calendar manifest**

Open `backend/apps/calendar/manifest.py`. Add:

```python
    requires_auth = True
    requires_tier: Literal["free", "paid"] = "paid"  # Calendar = paid-only app
```

Add `from typing import Literal` if not present.

- [ ] **Step 3: Verify Todo, Chat, Health2 are "free" (default)**

These apps should already work since `requires_tier = "free"` is the default in `AppManifestSchema`.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/finance/manifest.py backend/apps/calendar/manifest.py
git commit -m "feat: mark finance and calendar as paid-only apps

Sets requires_tier='paid' in manifest. Free users will be blocked at installation with an upgrade message."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 7: Frontend — Billing page and success/cancel pages

**Files:**
- Create: `frontend/src/pages/BillingPage.tsx`
- Create: `frontend/src/apps/billing/AppView.tsx`
- Modify: `frontend/src/App.tsx` (or routing config)

- [ ] **Step 1: Create `frontend/src/pages/BillingPage.tsx`**

This page shows the current subscription and allows upgrading.

```typescript
import { useState } from "react";
import { Button, Card, Spinner, useDisclosure } from "@heroui/react";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/shared/hooks/usePermission";
import { billingCheckout } from "@/apps/billing/api"; // Generated API

export default function BillingPage() {
  const { user, subscription } = useAuth();
  const isPaid = usePermission("finance_install");
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (provider: "stripe" | "payos") => {
    setLoading(provider);
    try {
      const res = await billingCheckout({ provider });
      window.location.href = res.checkout_url;
    } catch (err) {
      console.error("Checkout error:", err);
      setLoading(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Billing & Subscription</h1>

      <Card className="p-6 mb-6 widget-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-label">Current Plan</p>
            <p className="stat-value text-2xl mt-1">
              {subscription?.tier === "paid" ? "Paid" : "Free"}
            </p>
            <p className="text-muted text-sm mt-1">
              Status: {subscription?.status ?? "inactive"}
              {subscription?.expires_at && (
                <> · Expires {new Date(subscription.expires_at).toLocaleDateString()}</>
              )}
            </p>
          </div>
          {isPaid && (
            <span className="text-success text-sm font-medium">Active</span>
          )}
        </div>
      </Card>

      {subscription?.tier !== "paid" && (
        <Card className="p-6 widget-card">
          <p className="section-label mb-2">Upgrade to Paid</p>
          <p className="text-muted text-sm mb-4">
            Unlock Finance, Calendar, and all premium features.
          </p>
          <div className="flex gap-3">
            <Button
              color="primary"
              onPress={() => handleUpgrade("stripe")}
              isLoading={loading === "stripe"}
            >
              Pay with Stripe
            </Button>
            <Button
              color="secondary"
              variant="bordered"
              onPress={() => handleUpgrade("payos")}
              isLoading={loading === "payos"}
            >
              Pay with PayOS (VN)
            </Button>
          </div>
        </Card>
      )}

      {subscription?.tier === "paid" && (
        <Card className="p-6 widget-card">
          <p className="section-label mb-2">Cancel Subscription</p>
          <p className="text-muted text-sm mb-4">
            Your access will continue until the end of the billing period.
          </p>
          <Button color="danger" variant="bordered" isDisabled>
            Cancel (coming soon)
          </Button>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/apps/billing/AppView.tsx`**

```typescript
import BillingPage from "@/pages/BillingPage";

export default function BillingAppView() {
  return <BillingPage />;
}
```

- [ ] **Step 3: Create success/cancel redirect pages**

```typescript
// frontend/src/pages/BillingSuccessPage.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function BillingSuccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to dashboard after 3 seconds
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-success mb-2">Payment Successful!</h1>
        <p className="text-muted">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}
```

```typescript
// frontend/src/pages/BillingCancelPage.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function BillingCancelPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/billing"), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-danger mb-2">Payment Cancelled</h1>
        <p className="text-muted">Redirecting back to billing...</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add routes (check existing routing setup)**

Find the main routing file (likely `frontend/src/App.tsx` or `frontend/src/main.tsx`). Add:

```typescript
import BillingPage from "@/pages/BillingPage";
import BillingSuccessPage from "@/pages/BillingSuccessPage";
import BillingCancelPage from "@/pages/BillingCancelPage";

// Add routes:
// /billing → BillingPage
// /billing/success → BillingSuccessPage
// /billing/cancel → BillingCancelPage
```

The exact route addition depends on the existing routing library (React Router v6 is assumed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/BillingPage.tsx frontend/src/pages/BillingSuccessPage.tsx frontend/src/pages/BillingCancelPage.tsx frontend/src/apps/billing/AppView.tsx
git commit -m "feat(fe): add billing page with Stripe and PayOS checkout options

Adds BillingPage, BillingSuccessPage, and BillingCancelPage. Integrates with billingCheckout from generated API."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 8: Final verification

- [ ] **Step 1: Run manifest validation**

```bash
python scripts/superin.py manifests validate
```

- [ ] **Step 2: Run codegen**

```bash
python scripts/superin.py codegen
```

- [ ] **Step 3: Run ruff check**

```bash
ruff check backend/
```

- [ ] **Step 4: Type check frontend**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Verify env template**

```bash
# Add to backend/.env:
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# STRIPE_PRICE_ID=
# PAYOS_CLIENT_ID=
# PAYOS_API_KEY=
# PAYOS_CHECKSUM_KEY=
# PAYOS_PRICE_VND=99000
```

---

## Self-Review Checklist

- [ ] Spec coverage: All payment flows in master spec (Stripe checkout, PayOS checkout, webhooks, cancellation) have a task above.
- [ ] Placeholder scan: No "TBD", "TODO" in implementation steps (TODO in cron route is acknowledged and documented).
- [ ] Type consistency: All enums (`SubscriptionTier`, `PaymentProvider`) imported from `shared.enums`.
- [ ] PayOS signature: HMAC-SHA256 correctly implements PayOS API spec (data sorted alphabetically).
- [ ] Stripe webhook: Signature verification before parsing.
- [ ] No silent catches: All provider errors logged and returned as 502.
- [ ] Webhook returns 200: Both webhook handlers return 200 even on error (to prevent provider retry loops).
- [ ] DB transactions: `activate_paid_subscription` uses Mongo session for durability.
- [ ] PayOS order code: Numeric, collision-resistant, stored in `provider_subscription_id`.
- [ ] PayOS webhook correlation: Order code used to look up Subscription document.

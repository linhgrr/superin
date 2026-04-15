"""Subscription and payment service.

Cross-cutting logic lives here. Provider-specific implementations are in submodules:
  - _shared.py  — HTTP client, webhook dedup, signature helpers, PayOS expiry
  - stripe.py   — Stripe checkout, cancellation, webhook processing
  - payos.py     — PayOS checkout, webhook processing
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from beanie import PydanticObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from core.config import settings
from core.models import User
from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier
from shared.schemas import SubscriptionRead

from ._shared import (
    PAYOS_SUCCESS_CODE,
    STRIPE_API_BASE,
    close_payment_http_client,  # noqa: F401 — re-exported for callers in main.py
    downgrade_expired_payos_subscription,
    get_payment_http_client,
    payos_build_order_code,
    payos_build_webhook_event_id,
    payos_create_signature_for_payment_request,
    payos_create_signature_from_object,
    payos_verify_signature,
    stripe_verify_signature,
)
from .model import Subscription, SubscriptionWebhookEvent
from .schemas import CheckoutRequest, CheckoutResponse, WebhookAck

# ─── Public API ─────────────────────────────────────────────────────────────────


async def get_or_default_subscription(user_id: str) -> SubscriptionRead:
    """Return user's current subscription or free/inactive default."""
    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    sub = await downgrade_expired_payos_subscription(sub)
    if sub is None:
        return SubscriptionRead(
            tier=SubscriptionTier.FREE,
            status=SubscriptionStatus.INACTIVE,
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


async def get_effective_tier(user_id: str) -> SubscriptionTier:
    """Return effective tier with PayOS expiry downgrade applied."""
    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    sub = await downgrade_expired_payos_subscription(sub)
    return sub.tier if sub else SubscriptionTier.FREE


async def create_checkout(user_id: str, request: CheckoutRequest) -> CheckoutResponse:
    """Create checkout session for requested/default provider."""
    provider = request.provider or settings.payment_default_provider
    if provider is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing provider. Pass `provider` in request or set "
                "PAYMENT_DEFAULT_PROVIDER in environment."
            ),
        )

    if provider == PaymentProvider.STRIPE:
        return await _create_stripe_checkout(user_id, request)
    if provider == PaymentProvider.PAYOS:
        return await _create_payos_checkout(user_id, request)
    raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'")


async def cancel_current_subscription(user_id: str) -> SubscriptionRead:
    """Cancel user's local subscription state."""
    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None:
        return SubscriptionRead(
            tier=SubscriptionTier.FREE,
            status=SubscriptionStatus.CANCELLED,
            provider=None,
            started_at=None,
            expires_at=None,
        )

    if sub.provider == PaymentProvider.STRIPE:
        await _cancel_stripe_subscription(str(sub.provider_subscription_id))

    sub.tier = SubscriptionTier.FREE
    sub.status = SubscriptionStatus.CANCELLED
    sub.cancelled_at = datetime.now(UTC)
    sub.updated_at = datetime.now(UTC)
    await sub.save()

    return SubscriptionRead(
        tier=sub.tier,
        status=sub.status,
        provider=sub.provider,
        started_at=sub.started_at,
        expires_at=sub.expires_at,
    )


# ─── Webhook handlers ────────────────────────────────────────────────────────────


async def process_stripe_webhook(*, payload: bytes, signature_header: str | None) -> WebhookAck:
    """Validate and process a Stripe webhook payload."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=501, detail="Stripe webhook secret is not configured.")
    if not _verify_stripe_signature(
        payload=payload,
        signature_header=signature_header,
        secret=settings.stripe_webhook_secret,
        tolerance_seconds=settings.stripe_webhook_tolerance_seconds,
    ):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    return WebhookAck(
        provider=PaymentProvider.STRIPE,
        processed=True,
        message="Stripe webhook received",
    )


async def process_payos_webhook(*, payload: bytes) -> WebhookAck:
    """Validate and process a PayOS webhook payload."""
    checksum_key = _require_payos_setting(settings.payos_checksum_key, "PAYOS_CHECKSUM_KEY")
    if not isinstance(checksum_key, str):
        raise HTTPException(status_code=501, detail="Invalid PayOS configuration")

    try:
        body = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid PayOS webhook payload") from exc

    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    signature = body.get("signature")
    if signature and isinstance(signature, str):
        if not _verify_payos_signature(data=data, signature=signature, checksum_key=checksum_key):
            raise HTTPException(status_code=400, detail="Invalid PayOS signature")

    event_id = payos_build_webhook_event_id(data)
    if not await _mark_webhook_event_received(PaymentProvider.PAYOS, event_id):
        return WebhookAck(
            provider=PaymentProvider.PAYOS,
            processed=True,
            message="Duplicate event ignored",
        )

    code = str(data.get("code") or body.get("code") or "")
    if code != PAYOS_SUCCESS_CODE:
        return WebhookAck(
            provider=PaymentProvider.PAYOS,
            processed=True,
            message=f"Ignored PayOS webhook with code {code or 'unknown'}",
        )

    order_code = str(data.get("orderCode", "")).strip()
    payment_link_id = str(data.get("paymentLinkId", "")).strip() or None
    subscription = await _find_subscription_for_payos(
        order_code=order_code,
        payment_link_id=payment_link_id,
    )
    if subscription is None:
        return WebhookAck(
            provider=PaymentProvider.PAYOS,
            processed=True,
            message="No matching subscription for PayOS webhook",
        )

    expires_at = None
    if settings.payos_paid_duration_days:
        expires_at = datetime.now(UTC) + timedelta(days=settings.payos_paid_duration_days)

    await _activate_paid_subscription_core(
        user_id=str(subscription.user_id),
        provider=PaymentProvider.PAYOS,
        provider_reference=order_code or str(subscription.provider_subscription_id or ""),
        expires_at=expires_at,
    )
    return WebhookAck(
        provider=PaymentProvider.PAYOS,
        processed=True,
        message="PayOS webhook processed",
    )


# ─── Stripe ─────────────────────────────────────────────────────────────────────


async def _create_stripe_checkout(user_id: str, request: CheckoutRequest) -> CheckoutResponse:
    if not settings.stripe_secret_key or not settings.stripe_price_id_paid_monthly:
        raise HTTPException(status_code=501, detail="Stripe is not configured.")

    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")

    success_url = request.success_url or settings.stripe_checkout_success_url
    cancel_url = request.cancel_url or settings.stripe_checkout_cancel_url
    if not success_url or not cancel_url:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing success_url/cancel_url. Set STRIPE_CHECKOUT_SUCCESS_URL and "
                "STRIPE_CHECKOUT_CANCEL_URL in env or pass in request."
            ),
        )

    from urllib.parse import urlencode

    form = {
        "mode": "subscription",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "customer_email": user.email,
        "line_items[0][price]": settings.stripe_price_id_paid_monthly,
        "line_items[0][quantity]": "1",
        "metadata[user_id]": str(user.id),
        "metadata[provider]": PaymentProvider.STRIPE.value,
    }

    client = await get_payment_http_client()
    response = await client.post(
        f"{STRIPE_API_BASE}/checkout/sessions",
        content=urlencode(form),
        headers={
            "Authorization": f"Bearer {settings.stripe_secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Stripe checkout creation failed: {response.text}",
        )
    payload = response.json()

    checkout_url = payload.get("url")
    session_id = payload.get("id")
    if not checkout_url or not session_id:
        raise HTTPException(status_code=502, detail="Stripe returned malformed checkout response.")

    return CheckoutResponse(
        provider=PaymentProvider.STRIPE,
        checkout_url=checkout_url,
        provider_reference=session_id,
    )


async def _cancel_stripe_subscription(provider_subscription_id: str) -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=501, detail="Stripe is not configured.")

    client = await get_payment_http_client()
    response = await client.delete(
        f"{STRIPE_API_BASE}/subscriptions/{provider_subscription_id}",
        headers={"Authorization": f"Bearer {settings.stripe_secret_key}"},
    )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Stripe cancellation failed: {response.text}",
        )


async def _activate_paid_subscription_core(
    *,
    user_id: str,
    provider: PaymentProvider,
    provider_reference: str,
    expires_at: datetime | None = None,
) -> Subscription:
    """Internal core for activating paid subscription (used by both Stripe and PayOS webhooks)."""
    now = datetime.now(UTC)
    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None:
        sub = Subscription(
            user_id=PydanticObjectId(user_id),
            tier=SubscriptionTier.PAID,
            status=SubscriptionStatus.ACTIVE,
            provider=provider,
            provider_subscription_id=provider_reference,
            started_at=now,
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )
        await sub.insert()
        return sub

    sub.tier = SubscriptionTier.PAID
    sub.status = SubscriptionStatus.ACTIVE
    sub.provider = provider
    sub.provider_subscription_id = provider_reference
    sub.started_at = sub.started_at or now
    sub.expires_at = expires_at if provider == PaymentProvider.PAYOS else None
    sub.updated_at = now
    await sub.save()
    return sub


async def set_status_by_provider_reference(
    *,
    provider: PaymentProvider,
    provider_reference: str,
    status: SubscriptionStatus,
    tier: SubscriptionTier | None = None,
) -> None:
    """Update subscription status by provider reference."""
    sub = await Subscription.find_one(
        Subscription.provider == provider,
        Subscription.provider_subscription_id == provider_reference,
    )
    if sub is None:
        return

    sub.status = status
    if tier is not None:
        sub.tier = tier
    if status == SubscriptionStatus.CANCELLED:
        sub.cancelled_at = datetime.now(UTC)
    sub.updated_at = datetime.now(UTC)
    await sub.save()


# ─── PayOS ───────────────────────────────────────────────────────────────────────


def _require_payos_setting(value: str | int | None, env_name: str) -> str | int:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise HTTPException(
            status_code=501,
            detail=f"PayOS is not configured: missing {env_name}",
        )
    return value


async def _upsert_payos_checkout_mapping(*, user_id: str, order_code: str, payment_link_id: str) -> None:
    now = datetime.now(UTC)
    sub = await Subscription.find_one(Subscription.user_id == PydanticObjectId(user_id))
    if sub is None:
        sub = Subscription(
            user_id=PydanticObjectId(user_id),
            tier=SubscriptionTier.FREE,
            status=SubscriptionStatus.INACTIVE,
            provider=PaymentProvider.PAYOS,
            provider_subscription_id=order_code,
            payos_payment_link_id=payment_link_id,
            created_at=now,
            updated_at=now,
        )
        await sub.insert()
        return

    sub.provider = PaymentProvider.PAYOS
    sub.provider_subscription_id = order_code
    sub.payos_payment_link_id = payment_link_id
    sub.updated_at = now
    await sub.save()


async def _find_subscription_for_payos(*, order_code: str, payment_link_id: str | None) -> Subscription | None:
    sub = await Subscription.find_one(
        Subscription.provider == PaymentProvider.PAYOS,
        Subscription.provider_subscription_id == order_code,
    )
    if sub is not None:
        return sub

    if not payment_link_id:
        return None

    return await Subscription.find_one(
        Subscription.provider == PaymentProvider.PAYOS,
        Subscription.payos_payment_link_id == payment_link_id,
    )


async def _create_payos_checkout(user_id: str, request: CheckoutRequest) -> CheckoutResponse:
    client_id = _require_payos_setting(settings.payos_client_id, "PAYOS_CLIENT_ID")
    api_key = _require_payos_setting(settings.payos_api_key, "PAYOS_API_KEY")
    checksum_key = _require_payos_setting(settings.payos_checksum_key, "PAYOS_CHECKSUM_KEY")
    base_url = _require_payos_setting(settings.payos_base_url, "PAYOS_BASE_URL")
    amount_vnd = _require_payos_setting(settings.payos_amount_vnd, "PAYOS_AMOUNT_VND")

    if not isinstance(client_id, str) or not isinstance(api_key, str):
        raise HTTPException(status_code=501, detail="Invalid PayOS credentials")
    if not isinstance(checksum_key, str) or not isinstance(base_url, str):
        raise HTTPException(status_code=501, detail="Invalid PayOS configuration")
    if not isinstance(amount_vnd, int) or amount_vnd <= 0:
        raise HTTPException(status_code=501, detail="PAYOS_AMOUNT_VND must be a positive integer")

    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")

    return_url = request.success_url or settings.payos_return_url
    cancel_url = request.cancel_url or settings.payos_cancel_url
    if not return_url or not cancel_url:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing success_url/cancel_url. Set PAYOS_RETURN_URL and "
                "PAYOS_CANCEL_URL in env or pass in request."
            ),
        )

    import time as _time

    order_code = payos_build_order_code()
    payload: dict[str, Any] = {
        "orderCode": order_code,
        "amount": amount_vnd,
        "description": "Superin paid plan",
        "returnUrl": return_url,
        "cancelUrl": cancel_url,
        "items": [{"name": "Superin Paid", "quantity": 1, "price": amount_vnd}],
        "buyerEmail": user.email,
    }

    expire_seconds = settings.payos_payment_link_expire_seconds
    if expire_seconds is not None:
        if expire_seconds <= 0:
            raise HTTPException(
                status_code=501,
                detail="PAYOS_PAYMENT_LINK_EXPIRE_SECONDS must be a positive integer",
            )
        payload["expiredAt"] = int(_time.time()) + expire_seconds

    payload["signature"] = payos_create_signature_for_payment_request(payload, checksum_key)

    client = await get_payment_http_client()
    response = await client.post(
        f"{base_url.rstrip('/')}/v2/payment-requests",
        json=payload,
        headers={
            "x-client-id": client_id,
            "x-api-key": api_key,
            "Content-Type": "application/json",
        },
    )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"PayOS checkout creation failed: {response.text}",
        )

    body = response.json()
    code = str(body.get("code", ""))
    desc = str(body.get("desc", ""))
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    response_signature = body.get("signature")

    if code != PAYOS_SUCCESS_CODE:
        raise HTTPException(
            status_code=502,
            detail=f"PayOS returned non-success code {code or 'unknown'}: {desc or 'no description'}",
        )

    if response_signature and isinstance(response_signature, str):
        if not payos_verify_signature(data=data, signature=response_signature, checksum_key=checksum_key):
            raise HTTPException(status_code=502, detail="PayOS response signature validation failed")

    checkout_url = data.get("checkoutUrl")
    payment_link_id = data.get("paymentLinkId")
    if not checkout_url or not payment_link_id:
        raise HTTPException(status_code=502, detail="PayOS returned malformed checkout response")

    await _upsert_payos_checkout_mapping(
        user_id=user_id,
        order_code=str(order_code),
        payment_link_id=str(payment_link_id),
    )

    return CheckoutResponse(
        provider=PaymentProvider.PAYOS,
        checkout_url=str(checkout_url),
        provider_reference=str(order_code),
    )


# ─── Cron ────────────────────────────────────────────────────────────────────────


async def expire_due_payos_subscriptions(*, limit: int = 500) -> int:
    """Downgrade expired active PayOS subscriptions to free/inactive.

    Intended for periodic cron execution.
    """
    now = datetime.now(UTC)
    subscriptions = await Subscription.find(
        Subscription.provider == PaymentProvider.PAYOS,
        Subscription.tier == SubscriptionTier.PAID,
        Subscription.status == SubscriptionStatus.ACTIVE,
        Subscription.expires_at <= now,
    ).limit(limit).to_list()

    expired_count = 0
    for sub in subscriptions:
        if await downgrade_expired_payos_subscription(sub, now=now):
            expired_count += 1
    return expired_count


def _create_payos_signature_from_object(data: dict[str, Any], checksum_key: str) -> str:
    return payos_create_signature_from_object(data, checksum_key)


def _verify_payos_signature(*, data: dict[str, Any], signature: str, checksum_key: str) -> bool:
    return payos_verify_signature(data=data, signature=signature, checksum_key=checksum_key)


async def _mark_webhook_event_received(provider: PaymentProvider, event_id: str) -> bool:
    if not event_id:
        return True
    try:
        await SubscriptionWebhookEvent(provider=provider, event_id=event_id).insert()
    except DuplicateKeyError:
        return False
    return True


def _verify_stripe_signature(
    *,
    payload: bytes,
    signature_header: str | None,
    secret: str,
    tolerance_seconds: int = 300,
    now_ts: int | None = None,
) -> bool:
    return stripe_verify_signature(
        payload=payload,
        signature_header=signature_header,
        secret=secret,
        tolerance_seconds=tolerance_seconds,
        now_ts=now_ts,
    )

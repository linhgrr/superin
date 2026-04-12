"""Subscription and payment service."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from beanie import PydanticObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from core.config import settings
from core.models import User
from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier
from shared.schemas import SubscriptionRead

from .model import Subscription, SubscriptionWebhookEvent
from .schemas import CheckoutRequest, CheckoutResponse, WebhookAck

STRIPE_API_BASE = "https://api.stripe.com/v1"
STRIPE_EVENT_CHECKOUT_COMPLETED = "checkout.session.completed"
STRIPE_EVENT_SUBSCRIPTION_DELETED = "customer.subscription.deleted"
STRIPE_EVENT_SUBSCRIPTION_UPDATED = "customer.subscription.updated"
STRIPE_EVENT_INVOICE_PAYMENT_FAILED = "invoice.payment_failed"
DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300
PAYOS_SUCCESS_CODE = "00"


def _require_payos_setting(value: str | int | None, env_name: str) -> str | int:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise HTTPException(
            status_code=501,
            detail=f"PayOS is not configured: missing {env_name}",
        )
    return value


async def get_or_default_subscription(user_id: str) -> SubscriptionRead:
    """Return user's current subscription or free/inactive default."""
    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    sub = await _downgrade_expired_payos_subscription(sub)
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
    sub = await _downgrade_expired_payos_subscription(sub)
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
    sub = await Subscription.find_one(Subscription.user_id == PydanticObjectId(user_id))
    if sub is None:
        return SubscriptionRead(
            tier=SubscriptionTier.FREE,
            status=SubscriptionStatus.INACTIVE,
            provider=None,
            started_at=None,
            expires_at=None,
        )

    await _cancel_provider_subscription_if_needed(sub)

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


async def process_stripe_webhook(*, payload: bytes, signature_header: str | None) -> WebhookAck:
    """Validate and process Stripe webhook payload."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=501, detail="Stripe webhook secret is not configured.")
    if settings.stripe_webhook_tolerance_seconds <= 0:
        raise HTTPException(
            status_code=501,
            detail="STRIPE_WEBHOOK_TOLERANCE_SECONDS must be a positive integer.",
        )

    if not _verify_stripe_signature(
        payload=payload,
        signature_header=signature_header,
        secret=settings.stripe_webhook_secret,
        tolerance_seconds=settings.stripe_webhook_tolerance_seconds,
    ):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")

    event = json.loads(payload.decode("utf-8"))
    event_type = str(event.get("type", "unknown"))
    event_id = str(event.get("id", "")).strip() or _build_stripe_fallback_event_id(event)

    if not await _mark_webhook_event_received(PaymentProvider.STRIPE, event_id):
        return WebhookAck(
            provider=PaymentProvider.STRIPE,
            event_type=event_type,
            processed=True,
            message="Duplicate event ignored",
        )

    data_object = event.get("data", {}).get("object", {})

    if event_type == STRIPE_EVENT_CHECKOUT_COMPLETED:
        metadata = data_object.get("metadata") or {}
        user_id = metadata.get("user_id")
        provider_reference = data_object.get("subscription") or data_object.get("id")
        if user_id and provider_reference:
            subscription = await activate_paid_subscription(
                user_id=str(user_id),
                provider=PaymentProvider.STRIPE,
                provider_reference=str(provider_reference),
            )
            customer_id = data_object.get("customer")
            if customer_id:
                subscription.stripe_customer_id = str(customer_id)
                subscription.updated_at = datetime.now(UTC)
                await subscription.save()
            return WebhookAck(
                provider=PaymentProvider.STRIPE,
                event_type=event_type,
                processed=True,
            )
        return WebhookAck(
            provider=PaymentProvider.STRIPE,
            event_type=event_type,
            processed=False,
            message="Missing user_id or subscription reference",
        )

    if event_type == STRIPE_EVENT_SUBSCRIPTION_DELETED:
        provider_reference = data_object.get("id")
        if provider_reference:
            await set_status_by_provider_reference(
                provider=PaymentProvider.STRIPE,
                provider_reference=str(provider_reference),
                status=SubscriptionStatus.CANCELLED,
                tier=SubscriptionTier.FREE,
            )
            return WebhookAck(
                provider=PaymentProvider.STRIPE,
                event_type=event_type,
                processed=True,
            )
        return WebhookAck(
            provider=PaymentProvider.STRIPE,
            event_type=event_type,
            processed=False,
            message="Missing subscription id",
        )

    if event_type in {STRIPE_EVENT_SUBSCRIPTION_UPDATED, STRIPE_EVENT_INVOICE_PAYMENT_FAILED}:
        provider_reference = data_object.get("id") or data_object.get("subscription")
        if provider_reference:
            if event_type == STRIPE_EVENT_INVOICE_PAYMENT_FAILED:
                await set_status_by_provider_reference(
                    provider=PaymentProvider.STRIPE,
                    provider_reference=str(provider_reference),
                    status=SubscriptionStatus.PAST_DUE,
                )
            else:
                stripe_status = str(data_object.get("status", "")).lower()
                mapped_status = (
                    SubscriptionStatus.ACTIVE
                    if stripe_status in {"active", "trialing"}
                    else SubscriptionStatus.CANCELLED
                    if stripe_status in {"canceled", "unpaid", "incomplete_expired"}
                    else SubscriptionStatus.PAST_DUE
                    if stripe_status in {"past_due", "incomplete"}
                    else SubscriptionStatus.INACTIVE
                )
                tier = (
                    SubscriptionTier.PAID
                    if mapped_status == SubscriptionStatus.ACTIVE
                    else SubscriptionTier.FREE
                )
                await set_status_by_provider_reference(
                    provider=PaymentProvider.STRIPE,
                    provider_reference=str(provider_reference),
                    status=mapped_status,
                    tier=tier,
                )
            return WebhookAck(
                provider=PaymentProvider.STRIPE,
                event_type=event_type,
                processed=True,
            )

    return WebhookAck(
        provider=PaymentProvider.STRIPE,
        event_type=event_type,
        processed=False,
        message="Ignored event type",
    )


async def process_payos_webhook(*, payload: bytes) -> WebhookAck:
    """Validate and process PayOS webhook payload."""
    checksum_key = _require_payos_setting(settings.payos_checksum_key, "PAYOS_CHECKSUM_KEY")
    if not isinstance(checksum_key, str):
        raise HTTPException(status_code=501, detail="Invalid PAYOS_CHECKSUM_KEY")

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    signature = event.get("signature")
    data = event.get("data")
    if not signature or not isinstance(signature, str):
        raise HTTPException(status_code=400, detail="Missing webhook signature")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Missing webhook data")

    if not _verify_payos_signature(data=data, signature=signature, checksum_key=checksum_key):
        raise HTTPException(status_code=400, detail="Invalid PayOS signature")

    event_id = _build_payos_webhook_event_id(data)
    if not await _mark_webhook_event_received(PaymentProvider.PAYOS, event_id):
        return WebhookAck(
            provider=PaymentProvider.PAYOS,
            event_type="payment-webhook",
            processed=True,
            message="Duplicate event ignored",
        )

    payment_code = str(data.get("code", "")).strip()
    if payment_code != PAYOS_SUCCESS_CODE:
        return WebhookAck(
            provider=PaymentProvider.PAYOS,
            event_type="payment-webhook",
            processed=False,
            message=f"Ignoring non-success PayOS code '{payment_code or 'unknown'}'",
        )

    order_code = data.get("orderCode")
    payment_link_id = data.get("paymentLinkId")
    if order_code is None:
        return WebhookAck(
            provider=PaymentProvider.PAYOS,
            event_type="payment-webhook",
            processed=False,
            message="Missing orderCode",
        )

    subscription = await _find_subscription_for_payos(
        order_code=str(order_code),
        payment_link_id=str(payment_link_id) if payment_link_id else None,
    )
    if subscription is None:
        return WebhookAck(
            provider=PaymentProvider.PAYOS,
            event_type="payment-webhook",
            processed=False,
            message="No matching checkout session found",
        )

    duration_days = _require_payos_setting(
        settings.payos_paid_duration_days,
        "PAYOS_PAID_DURATION_DAYS",
    )
    if not isinstance(duration_days, int) or duration_days <= 0:
        raise HTTPException(status_code=501, detail="PAYOS_PAID_DURATION_DAYS must be a positive integer")

    expires_at = datetime.now(UTC) + timedelta(days=duration_days)
    updated = await activate_paid_subscription(
        user_id=str(subscription.user_id),
        provider=PaymentProvider.PAYOS,
        provider_reference=str(order_code),
        expires_at=expires_at,
    )
    if payment_link_id:
        updated.payos_payment_link_id = str(payment_link_id)
        updated.updated_at = datetime.now(UTC)
        await updated.save()

    return WebhookAck(
        provider=PaymentProvider.PAYOS,
        event_type="payment-webhook",
        processed=True,
    )


async def activate_paid_subscription(
    *,
    user_id: str,
    provider: PaymentProvider,
    provider_reference: str,
    expires_at: datetime | None = None,
) -> Subscription:
    """Activate paid subscription for user (upsert)."""
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

    async with httpx.AsyncClient(timeout=30.0) as client:
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

    order_code = _build_payos_order_code()
    payload: dict[str, Any] = {
        "orderCode": order_code,
        "amount": amount_vnd,
        "description": "Superin paid plan",
        "returnUrl": return_url,
        "cancelUrl": cancel_url,
        "items": [
            {
                "name": "Superin Paid",
                "quantity": 1,
                "price": amount_vnd,
            }
        ],
        "buyerEmail": user.email,
    }

    expire_seconds = settings.payos_payment_link_expire_seconds
    if expire_seconds is not None:
        if expire_seconds <= 0:
            raise HTTPException(
                status_code=501,
                detail="PAYOS_PAYMENT_LINK_EXPIRE_SECONDS must be a positive integer",
            )
        payload["expiredAt"] = int(time.time()) + expire_seconds

    payload["signature"] = _create_payos_signature_for_payment_request(payload, checksum_key)

    async with httpx.AsyncClient(timeout=30.0) as client:
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
        if not _verify_payos_signature(data=data, signature=response_signature, checksum_key=checksum_key):
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
        if await _downgrade_expired_payos_subscription(sub, now=now):
            expired_count += 1
    return expired_count


async def _mark_webhook_event_received(provider: PaymentProvider, event_id: str) -> bool:
    """Store webhook event id once. Returns False for duplicates."""
    if not event_id:
        return True

    try:
        await SubscriptionWebhookEvent(
            provider=provider,
            event_id=event_id,
        ).insert()
    except DuplicateKeyError:
        return False

    return True


def _build_stripe_fallback_event_id(event: dict[str, Any]) -> str:
    event_type = str(event.get("type", "unknown"))
    obj = event.get("data", {}).get("object", {})
    reference = obj.get("id") or obj.get("subscription") or "unknown"
    created = event.get("created") or "0"
    return f"{event_type}:{reference}:{created}"


def _build_payos_order_code() -> int:
    return int(time.time() * 1000)


def _build_payos_webhook_event_id(data: dict[str, Any]) -> str:
    payment_link_id = str(data.get("paymentLinkId", "")).strip() or "unknown"
    reference = str(data.get("reference", "")).strip()
    transaction_time = str(data.get("transactionDateTime", "")).strip()
    code = str(data.get("code", "")).strip()

    suffix = reference or transaction_time or code or "unknown"
    return f"{payment_link_id}:{suffix}"


def _normalize_payos_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    if isinstance(value, list):
        normalized_list = [item if not isinstance(item, dict) else dict(sorted(item.items())) for item in value]
        return json.dumps(normalized_list, separators=(",", ":"), ensure_ascii=False)
    if isinstance(value, dict):
        return json.dumps(dict(sorted(value.items())), separators=(",", ":"), ensure_ascii=False)
    return str(value)


def _create_payos_signature_from_object(data: dict[str, Any], checksum_key: str) -> str:
    parts: list[str] = []
    for key in sorted(data.keys()):
        parts.append(f"{key}={_normalize_payos_value(data[key])}")
    query_string = "&".join(parts)
    return hmac.new(
        checksum_key.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _create_payos_signature_for_payment_request(data: dict[str, Any], checksum_key: str) -> str:
    """Create a signature specifically for the create-payment-link request.
    
    According to PayOS docs, only amount, cancelUrl, description, orderCode, 
    and returnUrl must be included in the signature string for checkout creation.
    """
    amount = data.get("amount", "")
    cancel_url = data.get("cancelUrl", "")
    description = data.get("description", "")
    order_code = data.get("orderCode", "")
    return_url = data.get("returnUrl", "")
    
    data_str = f"amount={amount}&cancelUrl={cancel_url}&description={description}&orderCode={order_code}&returnUrl={return_url}"
    return hmac.new(
        checksum_key.encode("utf-8"),
        data_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _verify_payos_signature(*, data: dict[str, Any], signature: str, checksum_key: str) -> bool:
    expected = _create_payos_signature_from_object(data, checksum_key)
    return hmac.compare_digest(expected, signature)


def _verify_stripe_signature(
    *,
    payload: bytes,
    signature_header: str | None,
    secret: str,
    tolerance_seconds: int = DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
    now_ts: int | None = None,
) -> bool:
    if not signature_header:
        return False

    parts = [part.strip() for part in signature_header.split(",") if part.strip()]
    timestamp_raw: str | None = None
    signatures: list[str] = []
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        if key == "t":
            timestamp_raw = value
        elif key == "v1":
            signatures.append(value)

    if timestamp_raw is None or not signatures:
        return False

    try:
        timestamp = int(timestamp_raw)
    except ValueError:
        return False

    current_ts = now_ts if now_ts is not None else int(time.time())
    age_seconds = abs(current_ts - timestamp)
    if tolerance_seconds > 0 and age_seconds > tolerance_seconds:
        return False

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode()
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(digest, sig) for sig in signatures)


async def _cancel_provider_subscription_if_needed(sub: Subscription) -> None:
    if sub.provider != PaymentProvider.STRIPE:
        return
    if not sub.provider_subscription_id:
        raise HTTPException(
            status_code=409,
            detail="Stripe subscription reference is missing for cancellation.",
        )
    await _cancel_stripe_subscription(str(sub.provider_subscription_id))


async def _cancel_stripe_subscription(provider_subscription_id: str) -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=501, detail="Stripe is not configured.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(
            f"{STRIPE_API_BASE}/subscriptions/{provider_subscription_id}",
            headers={"Authorization": f"Bearer {settings.stripe_secret_key}"},
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Stripe cancellation failed: {response.text}",
        )


def _is_payos_subscription_expired(sub: Subscription, *, now: datetime | None = None) -> bool:
    if sub.provider != PaymentProvider.PAYOS:
        return False
    if sub.tier != SubscriptionTier.PAID or sub.status != SubscriptionStatus.ACTIVE:
        return False
    if sub.expires_at is None:
        return False
        
    expires = sub.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
        
    reference_time = now or datetime.now(UTC)
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=UTC)
        
    return expires <= reference_time


async def _downgrade_expired_payos_subscription(
    sub: Subscription | None,
    *,
    now: datetime | None = None,
) -> Subscription | None:
    if sub is None:
        return None
    if not _is_payos_subscription_expired(sub, now=now):
        return sub

    downgrade_time = now or datetime.now(UTC)
    sub.tier = SubscriptionTier.FREE
    sub.status = SubscriptionStatus.INACTIVE
    sub.updated_at = downgrade_time
    await sub.save()
    return sub

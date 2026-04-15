"""Internal helpers shared across payment providers."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from pymongo.errors import DuplicateKeyError

from shared.enums import PaymentProvider

from .model import Subscription, SubscriptionWebhookEvent

if TYPE_CHECKING:
    import httpx


# ─── HTTP client ────────────────────────────────────────────────────────────────

_http_client: httpx.AsyncClient | None = None


async def get_payment_http_client() -> httpx.AsyncClient:
    """Return the shared outbound HTTP client used by payment integrations."""
    global _http_client
    if _http_client is None:
        import httpx

        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0),
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        )
    return _http_client


async def close_payment_http_client() -> None:
    """Close the shared outbound HTTP client during app shutdown."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


# ─── Webhook deduplication ──────────────────────────────────────────────────────


async def mark_webhook_event_received(provider: PaymentProvider, event_id: str) -> bool:
    """
    Store webhook event id once. Returns False for duplicates.

    Idempotent: multiple deliveries of the same event are ignored after the first.
    """
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


# ─── PayOS helpers ───────────────────────────────────────────────────────────────

PAYOS_SUCCESS_CODE = "00"


def payos_normalize_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    if isinstance(value, list):
        normalized_list = [
            item if not isinstance(item, dict) else dict(sorted(item.items()))
            for item in value
        ]
        return json.dumps(normalized_list, separators=(",", ":"), ensure_ascii=False)
    if isinstance(value, dict):
        return json.dumps(dict(sorted(value.items())), separators=(",", ":"), ensure_ascii=False)
    return str(value)


def payos_create_signature_from_object(data: dict[str, Any], checksum_key: str) -> str:
    parts: list[str] = []
    for key in sorted(data.keys()):
        parts.append(f"{key}={payos_normalize_value(data[key])}")
    query_string = "&".join(parts)
    return hmac.new(
        checksum_key.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def payos_create_signature_for_payment_request(data: dict[str, Any], checksum_key: str) -> str:
    """
    Create a signature for the create-payment-link request.

    PayOS requires only amount, cancelUrl, description, orderCode, and returnUrl.
    """
    data_str = (
        f"amount={data.get('amount', '')}"
        f"&cancelUrl={data.get('cancelUrl', '')}"
        f"&description={data.get('description', '')}"
        f"&orderCode={data.get('orderCode', '')}"
        f"&returnUrl={data.get('returnUrl', '')}"
    )
    return hmac.new(
        checksum_key.encode("utf-8"),
        data_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def payos_verify_signature(*, data: dict[str, Any], signature: str, checksum_key: str) -> bool:
    expected = payos_create_signature_from_object(data, checksum_key)
    return hmac.compare_digest(expected, signature)


def payos_build_webhook_event_id(data: dict[str, Any]) -> str:
    payment_link_id = str(data.get("paymentLinkId", "")).strip() or "unknown"
    reference = str(data.get("reference", "")).strip()
    transaction_time = str(data.get("transactionDateTime", "")).strip()
    code = str(data.get("code", "")).strip()
    suffix = reference or transaction_time or code or "unknown"
    return f"{payment_link_id}:{suffix}"


def payos_build_order_code() -> int:
    return int(time.time() * 1000)


# ─── Stripe helpers ─────────────────────────────────────────────────────────────

DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300
STRIPE_API_BASE = "https://api.stripe.com/v1"
STRIPE_EVENT_CHECKOUT_COMPLETED = "checkout.session.completed"
STRIPE_EVENT_SUBSCRIPTION_DELETED = "customer.subscription.deleted"
STRIPE_EVENT_SUBSCRIPTION_UPDATED = "customer.subscription.updated"
STRIPE_EVENT_INVOICE_PAYMENT_FAILED = "invoice.payment_failed"


def stripe_verify_signature(
    *,
    payload: bytes,
    signature_header: str | None,
    secret: str,
    tolerance_seconds: int = DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
    now_ts: int | None = None,
) -> bool:
    """Verify a Stripe webhook signature (v1 HMAC)."""
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


def stripe_build_fallback_event_id(event: dict[str, Any]) -> str:
    event_type = str(event.get("type", "unknown"))
    obj = event.get("data", {}).get("object", {})
    reference = obj.get("id") or obj.get("subscription") or "unknown"
    created = event.get("created") or "0"
    return f"{event_type}:{reference}:{created}"


# ─── PayOS subscription expiry ─────────────────────────────────────────────────


def is_payos_subscription_expired(sub: Subscription, *, now: datetime | None = None) -> bool:
    """Check if a PayOS subscription has expired based on its expires_at field."""
    from shared.enums import SubscriptionStatus, SubscriptionTier

    if sub.provider != PaymentProvider.PAYOS:
        return False
    if sub.tier != SubscriptionTier.PAID or sub.status != SubscriptionStatus.ACTIVE:
        return False
    if sub.expires_at is None:
        return False

    from core.utils.timezone import ensure_aware_utc

    expires = ensure_aware_utc(sub.expires_at)
    reference_time = ensure_aware_utc(now or datetime.now(UTC))
    return expires <= reference_time


async def downgrade_expired_payos_subscription(
    sub: Subscription | None,
    *,
    now: datetime | None = None,
) -> Subscription | None:
    """Downgrade expired PayOS subscription to free/inactive, or return sub unchanged."""
    from shared.enums import SubscriptionStatus, SubscriptionTier

    if sub is None:
        return None
    if not is_payos_subscription_expired(sub, now=now):
        return sub

    downgrade_time = now or datetime.now(UTC)
    sub.tier = SubscriptionTier.FREE
    sub.status = SubscriptionStatus.INACTIVE
    sub.updated_at = downgrade_time
    await sub.save()
    return sub

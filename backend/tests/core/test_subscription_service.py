import hashlib
import hmac
import json

import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

import core.subscriptions.service as subscription_service
from core.subscriptions.schemas import CheckoutRequest
from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier


def test_create_payos_signature_from_object_uses_sorted_query_string() -> None:
    checksum_key = "top-secret"
    payload = {
        "orderCode": 123,
        "amount": 99000,
        "description": "Superin paid plan",
        "cancelUrl": "https://example.com/cancel",
        "returnUrl": "https://example.com/success",
        "buyerEmail": "user@example.com",
        "active": True,
        "optional": None,
    }

    actual = subscription_service._create_payos_signature_from_object(payload, checksum_key)
    raw = (
        "active=true"
        "&amount=99000"
        "&buyerEmail=user@example.com"
        "&cancelUrl=https://example.com/cancel"
        "&description=Superin paid plan"
        "&optional="
        "&orderCode=123"
        "&returnUrl=https://example.com/success"
    )
    expected = hmac.new(
        checksum_key.encode("utf-8"),
        raw.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    assert actual == expected


def test_verify_payos_signature_roundtrip() -> None:
    checksum_key = "top-secret"
    data = {
        "orderCode": 123,
        "code": "00",
        "paymentLinkId": "plink_1",
    }
    signature = subscription_service._create_payos_signature_from_object(data, checksum_key)

    assert subscription_service._verify_payos_signature(
        data=data,
        signature=signature,
        checksum_key=checksum_key,
    )


async def test_mark_webhook_event_received_is_idempotent(monkeypatch) -> None:
    class FakeEvent:
        calls = 0

        def __init__(self, **_kwargs) -> None:
            pass

        async def insert(self) -> None:
            FakeEvent.calls += 1
            if FakeEvent.calls > 1:
                raise DuplicateKeyError("duplicate")

    monkeypatch.setattr(subscription_service, "SubscriptionWebhookEvent", FakeEvent)

    first = await subscription_service._mark_webhook_event_received(
        PaymentProvider.PAYOS,
        "evt-1",
    )
    second = await subscription_service._mark_webhook_event_received(
        PaymentProvider.PAYOS,
        "evt-1",
    )

    assert first is True
    assert second is False


async def test_create_checkout_requires_provider_when_default_missing(monkeypatch) -> None:
    monkeypatch.setattr(subscription_service.settings, "payment_default_provider", None)

    with pytest.raises(HTTPException) as exc_info:
        await subscription_service.create_checkout(
            user_id="64f000000000000000000001",
            request=CheckoutRequest(provider=None),
        )

    assert exc_info.value.status_code == 400
    assert "Missing provider" in str(exc_info.value.detail)


async def test_process_payos_webhook_skips_duplicate_event(monkeypatch) -> None:
    checksum_key = "top-secret"
    data = {
        "orderCode": 123,
        "paymentLinkId": "plink_1",
        "code": "00",
    }
    signature = subscription_service._create_payos_signature_from_object(data, checksum_key)
    payload = json.dumps(
        {
            "code": "00",
            "desc": "success",
            "success": True,
            "data": data,
            "signature": signature,
        }
    ).encode("utf-8")

    monkeypatch.setattr(subscription_service.settings, "payos_checksum_key", checksum_key)

    async def fake_mark(_provider, _event_id: str) -> bool:
        return False

    monkeypatch.setattr(subscription_service, "_mark_webhook_event_received", fake_mark)

    ack = await subscription_service.process_payos_webhook(payload=payload)

    assert ack.provider == PaymentProvider.PAYOS
    assert ack.processed is True
    assert ack.message == "Duplicate event ignored"


def test_verify_stripe_signature_enforces_timestamp_tolerance() -> None:
    secret = "whsec_test"
    payload = b'{"id":"evt_test"}'
    timestamp = 1_700_000_000
    signed_payload = f"{timestamp}.{payload.decode()}".encode()
    signature = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    header = f"t={timestamp},v1={signature}"

    assert subscription_service._verify_stripe_signature(
        payload=payload,
        signature_header=header,
        secret=secret,
        tolerance_seconds=300,
        now_ts=timestamp + 60,
    )
    assert not subscription_service._verify_stripe_signature(
        payload=payload,
        signature_header=header,
        secret=secret,
        tolerance_seconds=300,
        now_ts=timestamp + 360,
    )


async def test_cancel_current_subscription_cancels_stripe_provider(monkeypatch) -> None:
    cancelled_references: list[str] = []

    class FakeSubscriptionDoc:
        provider = PaymentProvider.STRIPE
        provider_subscription_id = "sub_123"
        tier = SubscriptionTier.PAID
        status = SubscriptionStatus.ACTIVE
        cancelled_at = None
        updated_at = None
        started_at = None
        expires_at = None

        async def save(self) -> None:
            return None

    fake_sub = FakeSubscriptionDoc()

    class FakeSubscriptionModel:
        user_id = object()

        @staticmethod
        async def find_one(*_args, **_kwargs):
            return fake_sub

    async def fake_cancel(provider_subscription_id: str) -> None:
        cancelled_references.append(provider_subscription_id)

    monkeypatch.setattr(subscription_service, "Subscription", FakeSubscriptionModel)
    monkeypatch.setattr(subscription_service, "_cancel_stripe_subscription", fake_cancel)

    result = await subscription_service.cancel_current_subscription("64f000000000000000000001")

    assert cancelled_references == ["sub_123"]
    assert fake_sub.tier == SubscriptionTier.FREE
    assert fake_sub.status == SubscriptionStatus.CANCELLED
    assert result.tier == SubscriptionTier.FREE
    assert result.status == SubscriptionStatus.CANCELLED


async def test_get_or_default_subscription_downgrades_expired_payos(monkeypatch) -> None:
    class FakeSubscriptionDoc:
        provider = PaymentProvider.PAYOS
        provider_subscription_id = "order_123"
        tier = SubscriptionTier.PAID
        status = SubscriptionStatus.ACTIVE
        cancelled_at = None
        updated_at = None
        started_at = None
        expires_at = subscription_service.datetime.now(subscription_service.UTC) - subscription_service.timedelta(days=1)

        async def save(self) -> None:
            return None

    fake_sub = FakeSubscriptionDoc()

    class FakeSubscriptionModel:
        user_id = object()

        @staticmethod
        async def find_one(*_args, **_kwargs):
            return fake_sub

    monkeypatch.setattr(subscription_service, "Subscription", FakeSubscriptionModel)

    result = await subscription_service.get_or_default_subscription("64f000000000000000000001")

    assert fake_sub.tier == SubscriptionTier.FREE
    assert fake_sub.status == SubscriptionStatus.INACTIVE
    assert result.tier == SubscriptionTier.FREE
    assert result.status == SubscriptionStatus.INACTIVE

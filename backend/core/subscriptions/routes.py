"""Subscription routes — platform-level, not a plugin."""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from core.auth.dependencies import get_current_user
from core.utils.limiter import _InMemorySlidingWindow
from shared.schemas import SubscriptionRead

from .schemas import (
    CancelSubscriptionResponse,
    CheckoutRequest,
    CheckoutResponse,
    WebhookAck,
)
from .service import (
    cancel_current_subscription,
    create_checkout,
    get_or_default_subscription,
    process_payos_webhook,
    process_stripe_webhook,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Protect webhook endpoints from signature-computation DoS (10 req/min per IP)
_webhook_limiter = _InMemorySlidingWindow()


@router.get("/subscription", response_model=SubscriptionRead)
async def get_my_subscription(
    user_id: str = Depends(get_current_user),
) -> SubscriptionRead:
    """Return the current user's subscription (or default free/inactive)."""
    return await get_or_default_subscription(user_id)


@router.post("/checkout", response_model=CheckoutResponse)
async def create_subscription_checkout(
    request: CheckoutRequest,
    user_id: str = Depends(get_current_user),
) -> CheckoutResponse:
    """Create checkout URL for upgrading to paid tier."""
    return await create_checkout(user_id, request)


@router.post("/cancel", response_model=CancelSubscriptionResponse)
async def cancel_subscription(
    user_id: str = Depends(get_current_user),
) -> CancelSubscriptionResponse:
    """Cancel current subscription and downgrade to free."""
    sub = await cancel_current_subscription(user_id)
    return CancelSubscriptionResponse(
        cancelled=True,
        status=sub.status,
        tier=sub.tier,
    )


@router.post("/webhook/stripe", response_model=WebhookAck)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
) -> WebhookAck:
    """Stripe webhook endpoint."""
    client_ip = (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    allowed, err = _webhook_limiter.check_and_record(f"webhook:stripe:{client_ip}", [(10, 60)])
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err)
    payload = await request.body()
    return await process_stripe_webhook(
        payload=payload,
        signature_header=stripe_signature,
    )


@router.post("/webhook/payos", response_model=WebhookAck)
async def payos_webhook(request: Request) -> WebhookAck:
    """PayOS webhook endpoint."""
    client_ip = (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    allowed, err = _webhook_limiter.check_and_record(f"webhook:payos:{client_ip}", [(10, 60)])
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err)
    payload = await request.body()
    return await process_payos_webhook(payload=payload)

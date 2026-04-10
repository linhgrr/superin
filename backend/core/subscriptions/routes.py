"""Subscription routes — platform-level, not a plugin."""

import logging

from fastapi import APIRouter, Depends, Header, Request

from core.auth.dependencies import get_current_user
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
    payload = await request.body()
    return await process_stripe_webhook(
        payload=payload,
        signature_header=stripe_signature,
    )


@router.post("/webhook/payos", response_model=WebhookAck)
async def payos_webhook(request: Request) -> WebhookAck:
    """PayOS webhook endpoint."""
    payload = await request.body()
    return await process_payos_webhook(payload=payload)

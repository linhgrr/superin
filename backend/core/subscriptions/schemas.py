"""Subscription/payment API schemas."""

from pydantic import BaseModel, Field

from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier


class CheckoutRequest(BaseModel):
    provider: PaymentProvider | None = None
    success_url: str | None = None
    cancel_url: str | None = None


class CheckoutResponse(BaseModel):
    provider: PaymentProvider
    checkout_url: str
    provider_reference: str


class CancelSubscriptionResponse(BaseModel):
    cancelled: bool
    status: SubscriptionStatus
    tier: SubscriptionTier


class WebhookAck(BaseModel):
    ok: bool = True
    provider: PaymentProvider
    event_type: str = Field(default="unknown")
    processed: bool = False
    message: str | None = None

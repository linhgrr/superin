"""Billing request/response schemas."""

from datetime import datetime

from pydantic import BaseModel

from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier


class SubscriptionRead(BaseModel):
    """Current user's subscription info for API response."""

    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}

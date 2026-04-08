"""Billing Beanie document models."""

from datetime import datetime

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

from core.models import utc_now
from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier


class Subscription(Document):
    """User subscription state — one record per user."""

    user_id: PydanticObjectId
    tier: SubscriptionTier = "free"
    status: SubscriptionStatus = "inactive"
    provider: PaymentProvider | None = None
    provider_subscription_id: str | None = None
    started_at: datetime | None = None
    cancelled_at: datetime | None = None
    expires_at: datetime | None = None
    stripe_customer_id: str | None = None
    payos_payment_link_id: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "subscriptions"
        indexes = [
            IndexModel([("user_id", 1)], name="subscriptions_user_id_unique", unique=True),
            IndexModel(
                [("provider", 1), ("provider_subscription_id", 1)],
                name="subscriptions_provider_reference",
            ),
            IndexModel([("status", 1)], name="subscriptions_status_index"),
        ]

"""Billing app manifest — required by plugin registration."""

from typing import TYPE_CHECKING

from shared.enums import SubscriptionTier

if TYPE_CHECKING:
    from shared.schemas import WidgetManifestSchema
else:
    WidgetManifestSchema = object  # type: ignore


BILLING_WIDGETS: list[WidgetManifestSchema] = []


class BillingManifest:
    id = "billing"
    name = "Billing"
    version = "0.1.0"
    description = "Subscription management and billing"
    icon = "CreditCard"
    color = "oklch(0.65 0.21 280)"
    widgets = BILLING_WIDGETS
    agent_description = "Manages user subscription, billing, and payment"
    tools: list[str] = []
    models: list[str] = ["Subscription"]
    category = "other"
    tags: list[str] = []
    screenshots: list[str] = []
    author = "Shin Team"
    homepage = ""
    requires_auth = True
    requires_tier: SubscriptionTier = "free"

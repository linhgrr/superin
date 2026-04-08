"""Billing app manifest — required by plugin registration."""

from shared.schemas import AppManifestSchema

billing_manifest = AppManifestSchema(
    id="billing",
    name="Billing",
    version="0.1.0",
    description="Subscription management and billing",
    icon="CreditCard",
    color="oklch(0.65 0.21 280)",
    widgets=[],
    agent_description="Manages user subscription, billing, and payment",
    tools=[],
    models=["Subscription"],
    category="other",
    tags=[],
    screenshots=[],
    author="Shin Team",
    homepage="",
    requires_auth=True,
    requires_tier="free",
)

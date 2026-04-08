"""Billing plugin — subscription management and payment integration."""

import logging

from apps.billing.manifest import billing_manifest
from apps.billing.routes import router
from core.registry import register_plugin

logger = logging.getLogger(__name__)


def register() -> None:
    register_plugin(
        manifest=billing_manifest,
        router=router,
    )
    logger.info("✓ Billing plugin registered")

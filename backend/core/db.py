"""Beanie MongoDB initialization and connection management."""

from motor.motor_asyncio import AsyncIOMotorClient

from core.config import settings
from core.utils.index_contract import validate_index_contract

# ─── Global client (set during lifespan) ──────────────────────────────────────

_client: AsyncIOMotorClient | None = None


async def init_db() -> None:
    """Initialize Beanie with all known document models.

    Call once at server startup (inside lifespan).
    Plugin models are appended via get_plugin_models() after discovery.
    """
    global _client
    _client = AsyncIOMotorClient(settings.mongodb_uri)

    # Import here to avoid circular imports
    from beanie import init_beanie

    from core.models import (
        AppCategory,
        ConversationMessage,
        TokenBlacklist,
        User,
        UserAppInstallation,
        WidgetDataConfig,
        WidgetPreference,
    )
    from core.registry import get_plugin_models
    from core.subscriptions.model import Subscription, SubscriptionWebhookEvent

    database = _client[settings.mongodb_database]
    await validate_index_contract(database)

    await init_beanie(
        database=database,
        document_models=[
            User,
            UserAppInstallation,
            AppCategory,
            WidgetPreference,
            WidgetDataConfig,
            TokenBlacklist,
            ConversationMessage,
            Subscription,
            SubscriptionWebhookEvent,
            *get_plugin_models(),
        ],
    )


async def close_db() -> None:
    """Close the MongoDB client. Call once at server shutdown."""
    global _client
    if _client is not None:
        _client.close()
        _client = None


def get_db():
    """Return the active database instance. Requires init_db() to have run."""
    if _client is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _client[settings.mongodb_database]

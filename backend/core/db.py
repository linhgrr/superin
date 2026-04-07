"""Beanie MongoDB initialization and connection management."""

from pymongo import AsyncMongoClient

from core.config import settings
from core.index_contract import validate_index_contract

# ─── Global client (set during lifespan) ──────────────────────────────────────

_client: AsyncMongoClient | None = None


async def init_db() -> None:
    """Initialize Beanie with all known document models.

    Call once at server startup (inside lifespan).
    Plugin models are appended via get_plugin_models() after discovery.
    """
    global _client
    _client = AsyncMongoClient(settings.mongodb_uri)

    # Import here to avoid circular imports
    from beanie import init_beanie

    from core.models import (
        AppCategory,
        ConversationMessage,
        TokenBlacklist,
        User,
        UserAppInstallation,
        WidgetPreference,
    )
    from core.registry import get_plugin_models

    database = _client[settings.mongodb_database]
    await validate_index_contract(database)

    await init_beanie(
        database=database,
        document_models=[
            User,
            UserAppInstallation,
            AppCategory,
            WidgetPreference,
            TokenBlacklist,
            ConversationMessage,
            *get_plugin_models(),
        ],
    )


async def close_db() -> None:
    """Close the MongoDB client. Call once at server shutdown."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None


def get_db():
    """Return the active database instance. Requires init_db() to have run."""
    if _client is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _client[settings.mongodb_database]

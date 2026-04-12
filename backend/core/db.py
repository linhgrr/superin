"""Beanie MongoDB initialization and connection management."""

from langgraph.checkpoint.mongodb.aio import AsyncMongoDBSaver
from langgraph.store.mongodb import MongoDBStore
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

from core.config import settings
from core.utils.index_contract import validate_index_contract

# ─── Global clients (set during lifespan) ─────────────────────────────────────

_client: AsyncIOMotorClient | None = None
_sync_client: MongoClient | None = None  # Required by MongoDBStore (sync pymongo)
_checkpointer: AsyncMongoDBSaver | None = None
_store: MongoDBStore | None = None


async def init_db() -> None:
    """Initialize Beanie with all known document models.

    Call once at server startup (inside lifespan).
    Plugin models are appended via get_plugin_models() after discovery.
    """
    global _client, _sync_client, _checkpointer, _store
    _client = AsyncIOMotorClient(settings.mongodb_uri)

    # Initialize LangGraph checkpointer (async) and eagerly create indexes.
    # H6: _setup() is a private method in langgraph-checkpoint-mongodb < 0.3.0.
    # It ensures checkpoint collection indexes exist at startup (idempotent).
    # Pinned in requirements.txt: langgraph-checkpoint-mongodb<0.3.0
    _checkpointer = AsyncMongoDBSaver(_client, db_name=settings.mongodb_database)
    try:
        setup_fn = getattr(_checkpointer, "setup", None) or getattr(_checkpointer, "_setup", None)
        if setup_fn is not None:
            await setup_fn()
    except Exception:
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "LangGraph checkpointer setup() failed (index creation skipped). "
            "This may indicate a version mismatch with langgraph-checkpoint-mongodb.",
            exc_info=True,
        )

    # Initialize LangGraph store (long-term memory)
    # MongoDBStore requires a sync MongoClient; async ops run via thread pool.
    _sync_client = MongoClient(settings.mongodb_uri)
    store_collection = _sync_client[settings.mongodb_database]["agent_store"]
    _store = MongoDBStore(store_collection)

    # Import here to avoid circular imports
    from beanie import init_beanie

    from core.models import (
        AppCategory,
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
            Subscription,
            SubscriptionWebhookEvent,
            *get_plugin_models(),
        ],
    )


async def close_db() -> None:
    """Close all MongoDB clients. Call once at server shutdown."""
    global _client, _sync_client, _checkpointer, _store
    if _client is not None:
        _client.close()
        _client = None
    if _sync_client is not None:
        _sync_client.close()
        _sync_client = None
    _checkpointer = None
    _store = None


def get_db():
    """Return the active database instance. Requires init_db() to have run."""
    if _client is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _client[settings.mongodb_database]


def get_checkpointer() -> AsyncMongoDBSaver:
    """Return the LangGraph Checkpointer connected to MongoDB."""
    if _checkpointer is None:
        raise RuntimeError("Checkpointer not initialized. Call init_db() first.")
    return _checkpointer


def get_store() -> MongoDBStore:
    """Return the LangGraph Store connected to MongoDB."""
    if _store is None:
        raise RuntimeError("Store not initialized. Call init_db() first.")
    return _store

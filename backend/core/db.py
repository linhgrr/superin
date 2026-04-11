"""Beanie MongoDB initialization and connection management."""

from langgraph.checkpoint.mongodb.aio import AsyncMongoDBSaver
from langgraph.store.mongodb import MongoDBStore
from motor.motor_asyncio import AsyncIOMotorClient

from core.config import settings
from core.utils.index_contract import validate_index_contract

# ─── Global client (set during lifespan) ──────────────────────────────────────

_client: AsyncIOMotorClient | None = None
_checkpointer: AsyncMongoDBSaver | None = None
_store: MongoDBStore | None = None


async def init_db() -> None:
    """Initialize Beanie with all known document models.

    Call once at server startup (inside lifespan).
    Plugin models are appended via get_plugin_models() after discovery.
    """
    global _client, _checkpointer, _store
    _client = AsyncIOMotorClient(settings.mongodb_uri)

    # Initialize LangGraph checkpointer and store
    from pymongo import MongoClient
    # Note: MongoDBStore currently requires a sync MongoClient under the hood for some operations,
    # but provides async methods (aget, aput). The AsyncMongoDBSaver takes an AsyncIOMotorClient.
    _checkpointer = AsyncMongoDBSaver(_client, db_name=settings.mongodb_database)
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
    """Close the MongoDB client. Call once at server shutdown."""
    global _client, _checkpointer, _store
    if _client is not None:
        _client.close()
        _client = None
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

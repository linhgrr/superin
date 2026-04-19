"""Beanie MongoDB initialization and connection management."""

from typing import Any

from langgraph.checkpoint.mongodb.aio import AsyncMongoDBSaver
from langgraph.store.mongodb import MongoDBStore
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

from core.config import settings
from core.utils.index_contract import validate_index_contract

# ─── Global clients (set during lifespan) ─────────────────────────────────────

_client: AsyncIOMotorClient | None = None
_sync_client: MongoClient | None = None  # Required by MongoDBStore (sync pymongo)
_store: MongoDBStore | None = None
_checkpointer: AsyncMongoDBSaver | None = None


async def init_db() -> None:
    """Initialize Beanie with all known document models.

    Call once at server startup (inside lifespan).
    Plugin models are appended via get_plugin_models() after discovery.
    """
    global _client, _sync_client, _store, _checkpointer
    _client = AsyncIOMotorClient(settings.mongodb_uri)

    # Initialize LangGraph store (long-term memory)
    # MongoDBStore requires a sync MongoClient; async ops run via thread pool.
    _sync_client = MongoClient(settings.mongodb_uri)
    store_collection = _sync_client[settings.mongodb_database]["agent_store"]
    _store = MongoDBStore(store_collection)

    _checkpointer = AsyncMongoDBSaver(
        client=_client,
        db_name=settings.mongodb_database,
        checkpoint_collection_name="agent_checkpoints",
        writes_collection_name="agent_checkpoint_writes"
    )

    # Import here to avoid circular imports
    from beanie import init_beanie

    from core.models import (
        AppCategory,
        ConversationMessage,
 ThreadMeta,
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
 ThreadMeta,
            Subscription,
            SubscriptionWebhookEvent,
            *get_plugin_models(),
        ],
    )


async def close_db() -> None:
    """Close all MongoDB clients. Call once at server shutdown."""
    global _client, _sync_client, _store, _checkpointer
    if _client is not None:
        _client.close()
        _client = None
    if _sync_client is not None:
        _sync_client.close()
        _sync_client = None
    _store = None
    _checkpointer = None


def get_db():
    """Return the active database instance. Requires init_db() to have run."""
    if _client is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _client[settings.mongodb_database]

def get_store() -> MongoDBStore:
    """Return the LangGraph Store connected to MongoDB."""
    if _store is None:
        raise RuntimeError("Store not initialized. Call init_db() first.")
    return _store

def get_checkpointer() -> AsyncMongoDBSaver:
    """Return the LangGraph Checkpointer connected to MongoDB."""
    if _checkpointer is None:
        raise RuntimeError("Checkpointer not initialized. Call init_db() first.")
    return _checkpointer


def get_document_collection(document_model: Any) -> Any:
    """Return the underlying collection for a Beanie document model."""
    if hasattr(document_model, "get_motor_collection"):
        return document_model.get_motor_collection()
    if hasattr(document_model, "get_pymongo_collection"):
        return document_model.get_pymongo_collection()
    raise AttributeError(
        f"{getattr(document_model, '__name__', document_model)!r} has no collection accessor"
    )

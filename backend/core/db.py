"""Beanie MongoDB initialization and LangGraph persistence wiring."""

from __future__ import annotations

from typing import Any

from langgraph.checkpoint.mongodb import MongoDBSaver
from langgraph.store.mongodb import MongoDBStore
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

from core.config import settings
from core.utils.index_contract import validate_index_contract

_client: AsyncIOMotorClient | None = None
_sync_client: MongoClient | None = None
_store: MongoDBStore | None = None
_checkpointer: MongoDBSaver | None = None


async def init_db() -> None:
    """Initialize Beanie plus LangGraph store/checkpointer using current package APIs."""
    global _client, _sync_client, _store, _checkpointer

    _client = AsyncIOMotorClient(settings.mongodb_uri)
    _sync_client = MongoClient(settings.mongodb_uri)

    database = _client[settings.mongodb_database]
    await validate_index_contract(database)

    sync_database = _sync_client[settings.mongodb_database]
    _store = MongoDBStore(sync_database["agent_store"])
    if not hasattr(_store, "sep"):
        # Current langgraph mongodb store only sets `sep` when vector indexing is
        # configured, but some internal search code still reads it unconditionally.
        _store.sep = "/"  # type: ignore[attr-defined]

    _checkpointer = MongoDBSaver(
        client=_sync_client,
        db_name=settings.mongodb_database,
        checkpoint_collection_name="agent_checkpoints",
        writes_collection_name="agent_checkpoint_writes",
    )

    from beanie import init_beanie

    from core.models import (
        AppCategory,
        ThreadMeta,
        TokenBlacklist,
        User,
        UserAppInstallation,
        WidgetDataConfig,
        WidgetPreference,
    )
    from core.registry import get_plugin_models
    from core.subscriptions.model import Subscription, SubscriptionWebhookEvent

    await init_beanie(
        database=database,
        document_models=[
            User,
            UserAppInstallation,
            AppCategory,
            WidgetPreference,
            WidgetDataConfig,
            TokenBlacklist,
            ThreadMeta,
            Subscription,
            SubscriptionWebhookEvent,
            *get_plugin_models(),
        ],
    )


async def close_db() -> None:
    """Close all MongoDB clients. Call once at server shutdown."""
    global _client, _sync_client, _store, _checkpointer

    if _checkpointer is not None:
        _checkpointer.close()
        _checkpointer = None
    if _client is not None:
        _client.close()
        _client = None
    if _sync_client is not None:
        _sync_client.close()
        _sync_client = None
    _store = None


def get_db():
    """Return the active async MongoDB database handle."""
    if _client is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _client[settings.mongodb_database]


def get_store() -> MongoDBStore:
    """Return the LangGraph store connected to MongoDB."""
    if _store is None:
        raise RuntimeError("Store not initialized. Call init_db() first.")
    return _store


def get_checkpointer() -> MongoDBSaver:
    """Return the LangGraph MongoDB checkpointer."""
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

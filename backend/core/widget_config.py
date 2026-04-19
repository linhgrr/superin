"""Helpers for widget config resolution and data contract enforcement."""

from __future__ import annotations

import logging
from typing import Any

from beanie import PydanticObjectId
from pydantic import BaseModel, ValidationError

from core.models import WidgetDataConfig
from core.registry import WIDGET_CONFIG_MODELS

logger = logging.getLogger(__name__)


class EmptyWidgetConfig(BaseModel):
    """Fallback config model for widgets without registered config."""


async def resolve_widget_config(user_id: str, widget_id: str) -> BaseModel:
    """Resolve persisted widget config and apply model defaults."""
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id, EmptyWidgetConfig)
    doc = await WidgetDataConfig.find_one(
        WidgetDataConfig.user_id == PydanticObjectId(user_id),
        WidgetDataConfig.widget_id == widget_id,
    )
    raw_config = doc.config if doc else {}
    try:
        return model_cls.model_validate(raw_config)
    except ValidationError:
        logger.exception("Invalid widget config stored for %s", widget_id)
        return model_cls()


def resolve_widget_config_from_serialized(
    widget_id: str,
    raw_config: dict[str, Any] | None,
) -> BaseModel:
    """Resolve a validated config model from an already-loaded serialized payload."""
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id, EmptyWidgetConfig)
    try:
        return model_cls.model_validate(raw_config or {})
    except ValidationError:
        logger.exception("Invalid widget config snapshot stored for %s", widget_id)
        return model_cls()


def validate_and_serialize_config(widget_id: str, raw_config: dict[str, Any] | None) -> dict[str, Any]:
    """Validate input config and return a JSON-safe payload."""
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id, EmptyWidgetConfig)
    config = model_cls.model_validate(raw_config or {})
    return config.model_dump(mode="json")


async def upsert_widget_config(
    user_id: str,
    widget_id: str,
    raw_config: dict[str, Any] | None,
) -> WidgetDataConfig:
    """Persist a widget config, validating it before writing."""
    serialized = validate_and_serialize_config(widget_id, raw_config)
    doc = await WidgetDataConfig.find_one(
        WidgetDataConfig.user_id == PydanticObjectId(user_id),
        WidgetDataConfig.widget_id == widget_id,
    )
    if doc is None:
        doc = WidgetDataConfig(
            user_id=PydanticObjectId(user_id),
            widget_id=widget_id,
            config=serialized,
        )
    else:
        doc.config = serialized
    await doc.save()
    return doc

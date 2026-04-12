"""Mongo index contract validation helpers.

Runtime stance:
- App startup validates that no legacy/conflicting indexes remain.
- Local development should use a fresh database when the index contract changes.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class IndexRequirement:
    collection: str
    index_name: str
    key: tuple[tuple[str, int], ...]
    unique: bool
    partial_filter_expression: Mapping[str, Any] | None = None


@dataclass(frozen=True)
class IndexConflict:
    collection: str
    existing_index_name: str
    required_index_name: str
    key: tuple[tuple[str, int], ...]
    existing_unique: bool
    required_unique: bool
    existing_partial_filter_expression: Mapping[str, Any] | None
    required_partial_filter_expression: Mapping[str, Any] | None


INDEX_REQUIREMENTS: tuple[IndexRequirement, ...] = (
    IndexRequirement(
        collection="users",
        index_name="users_email_unique",
        key=(("email", 1),),
        unique=True,
    ),
    IndexRequirement(
        collection="users",
        index_name="users_role_index",
        key=(("role", 1),),
        unique=False,
    ),
    IndexRequirement(
        collection="user_app_installations",
        index_name="user_app_installations_user_id_app_id_unique",
        key=(("user_id", 1), ("app_id", 1)),
        unique=True,
    ),
    IndexRequirement(
        collection="widget_preferences",
        index_name="widget_preferences_user_id_widget_id_unique",
        key=(("user_id", 1), ("widget_id", 1)),
        unique=True,
    ),
    IndexRequirement(
        collection="widget_data_configs",
        index_name="widget_data_configs_user_widget_unique",
        key=(("user_id", 1), ("widget_id", 1)),
        unique=True,
    ),
    IndexRequirement(
        collection="token_blacklist",
        index_name="token_blacklist_jti_unique",
        key=(("jti", 1),),
        unique=True,
    ),
    IndexRequirement(
        collection="token_blacklist",
        index_name="token_blacklist_ttl",
        key=(("expires_at", 1),),
        unique=False,
    ),
    IndexRequirement(
        collection="app_categories",
        index_name="app_categories_name_unique",
        key=(("name", 1),),
        unique=True,
    ),
    IndexRequirement(
        collection="conversation_messages",
        index_name="conversation_messages_user_thread_created_at",
        key=(("user_id", 1), ("thread_id", 1), ("created_at", 1)),
        unique=False,
    ),
    IndexRequirement(
        collection="conversation_messages",
        index_name="conversation_messages_thread_created_at",
        key=(("thread_id", 1), ("created_at", 1)),
        unique=False,
    ),
    IndexRequirement(
        collection="subscriptions",
        index_name="subscriptions_user_id_unique",
        key=(("user_id", 1),),
        unique=True,
    ),
    IndexRequirement(
        collection="subscriptions",
        index_name="subscriptions_provider_reference",
        key=(("provider", 1), ("provider_subscription_id", 1)),
        unique=False,
    ),
    IndexRequirement(
        collection="subscriptions",
        index_name="subscriptions_status_index",
        key=(("status", 1),),
        unique=False,
    ),
    IndexRequirement(
        collection="subscription_webhook_events",
        index_name="subscription_webhook_events_provider_event_unique",
        key=(("provider", 1), ("event_id", 1)),
        unique=True,
    ),
    IndexRequirement(
        collection="subscription_webhook_events",
        index_name="subscription_webhook_events_received_at_index",
        key=(("received_at", 1),),
        unique=False,
    ),
    IndexRequirement(
        collection="finance_wallets",
        index_name="finance_wallets_user_id_name_key_unique",
        key=(("user_id", 1), ("name_key", 1)),
        unique=True,
    ),
    IndexRequirement(
        collection="finance_categories",
        index_name="finance_categories_user_id_name_key_unique",
        key=(("user_id", 1), ("name_key", 1)),
        unique=True,
    ),
    IndexRequirement(
        collection="calendar_calendars",
        index_name="calendar_calendars_user_id_name_key_unique",
        key=(("user_id", 1), ("name_key", 1)),
        unique=True,
    ),
    IndexRequirement(
        collection="calendar_calendars",
        index_name="calendar_calendars_user_id_is_default_unique",
        key=(("user_id", 1), ("is_default", 1)),
        unique=True,
        partial_filter_expression={"is_default": True},
    ),
)


def normalize_index_key(
    key: Sequence[tuple[str, int]] | Mapping[str, int],
) -> tuple[tuple[str, int], ...]:
    if isinstance(key, Mapping):
        return tuple((field, direction) for field, direction in key.items())
    return tuple((field, direction) for field, direction in key)


def normalize_partial_filter_expression(
    expression: Mapping[str, Any] | None,
) -> tuple[tuple[str, Any], ...] | None:
    if expression is None:
        return None
    return tuple(sorted(expression.items()))


async def collect_index_conflicts(database: Any) -> list[IndexConflict]:
    conflicts: list[IndexConflict] = []

    for requirement in INDEX_REQUIREMENTS:
        collection = database[requirement.collection]
        indexes = await collection.index_information()

        for index_name, index_info in indexes.items():
            if index_name == "_id_":
                continue

            existing_key = normalize_index_key(index_info["key"])
            existing_unique = bool(index_info.get("unique", False))
            existing_partial = index_info.get("partialFilterExpression")
            same_key = existing_key == requirement.key
            same_name = index_name == requirement.index_name
            same_partial = (
                normalize_partial_filter_expression(existing_partial)
                == normalize_partial_filter_expression(requirement.partial_filter_expression)
            )

            if not same_key and not same_name:
                continue

            if same_key and same_name and existing_unique == requirement.unique and same_partial:
                continue

            conflicts.append(
                IndexConflict(
                    collection=requirement.collection,
                    existing_index_name=index_name,
                    required_index_name=requirement.index_name,
                    key=requirement.key,
                    existing_unique=existing_unique,
                    required_unique=requirement.unique,
                    existing_partial_filter_expression=existing_partial,
                    required_partial_filter_expression=requirement.partial_filter_expression,
                )
            )
    return conflicts


async def validate_index_contract(database: Any) -> None:
    conflicts = await collect_index_conflicts(database)
    if not conflicts:
        return

    lines = [
        "Mongo index contract conflicts with legacy indexes in the configured database.",
        "Use a fresh Mongo database or run `python scripts/superin.py db reset --yes` in local development.",
        "Conflicts detected:",
    ]
    for conflict in conflicts:
        lines.append(
            "- "
            f"{conflict.collection}: existing `{conflict.existing_index_name}` "
            f"(unique={conflict.existing_unique}, partial={conflict.existing_partial_filter_expression}) conflicts with "
            f"required `{conflict.required_index_name}` "
            f"(unique={conflict.required_unique}, partial={conflict.required_partial_filter_expression}) "
            f"for key {list(conflict.key)}"
        )

    raise RuntimeError("\n".join(lines))

"""Mongo index contract validation and migration helpers.

Production stance:
- App startup should validate index contract and fail fast with actionable guidance.
- Schema-changing fixes (renames, uniqueness upgrades) should run via an explicit migration command.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from pymongo import IndexModel


@dataclass(frozen=True)
class IndexRequirement:
    collection: str
    index_name: str
    key: tuple[tuple[str, int], ...]
    unique: bool
    partial_filter_expression: Mapping[str, Any] | None = None

    def to_index_model(self) -> IndexModel:
        kwargs: dict[str, Any] = {
            "name": self.index_name,
            "unique": self.unique,
        }
        if self.partial_filter_expression is not None:
            kwargs["partialFilterExpression"] = dict(self.partial_filter_expression)
        return IndexModel(list(self.key), **kwargs)


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
        collection="token_blacklist",
        index_name="token_blacklist_jti_unique",
        key=(("jti", 1),),
        unique=True,
    ),
    IndexRequirement(
        collection="token_blacklist",
        index_name="token_blacklist_expires_at",
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


async def find_duplicate_values(
    collection: Any,
    key: Sequence[tuple[str, int]],
    limit: int = 5,
    partial_filter_expression: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    group_id = {
        field.replace(".", "_"): f"${field}"
        for field, _direction in key
    }
    pipeline: list[dict[str, Any]] = []
    if partial_filter_expression is not None:
        pipeline.append({"$match": dict(partial_filter_expression)})
    pipeline.extend(
        [
            {"$group": {"_id": group_id, "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}},
            {"$limit": limit},
        ]
    )
    cursor = await collection.aggregate(pipeline)

    duplicates: list[dict[str, Any]] = []
    async for doc in cursor:
        duplicates.append(doc)
    return duplicates


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
        "Mongo index contract is out of date for core collections.",
        "Run `python scripts/superin.py db migrate-indexes` before starting the API.",
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


async def migrate_index_contract(database: Any, logger: Any) -> None:
    for requirement in INDEX_REQUIREMENTS:
        collection = database[requirement.collection]
        indexes = await collection.index_information()

        desired_index = indexes.get(requirement.index_name)
        if desired_index:
            existing_key = normalize_index_key(desired_index["key"])
            existing_unique = bool(desired_index.get("unique", False))
            existing_partial = desired_index.get("partialFilterExpression")
            if (
                existing_key == requirement.key
                and existing_unique == requirement.unique
                and normalize_partial_filter_expression(existing_partial)
                == normalize_partial_filter_expression(requirement.partial_filter_expression)
            ):
                continue

        conflicting_index_names: list[str] = []
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

            conflicting_index_names.append(index_name)

        if requirement.unique:
            duplicates = await find_duplicate_values(
                collection,
                requirement.key,
                partial_filter_expression=requirement.partial_filter_expression,
            )
            if duplicates:
                raise RuntimeError(
                    "Cannot enforce unique index "
                    f"{requirement.index_name} on {requirement.collection} "
                    f"because duplicate values already exist: {duplicates}"
                )

        for index_name in conflicting_index_names:
            logger.warning(
                "Dropping conflicting index %s on %s before applying %s",
                index_name,
                requirement.collection,
                requirement.index_name,
            )
            await collection.drop_index(index_name)

        indexes = await collection.index_information()
        desired_index = indexes.get(requirement.index_name)
        desired_exists = False
        if desired_index:
            desired_exists = (
                normalize_index_key(desired_index["key"]) == requirement.key
                and bool(desired_index.get("unique", False)) == requirement.unique
                and normalize_partial_filter_expression(desired_index.get("partialFilterExpression"))
                == normalize_partial_filter_expression(requirement.partial_filter_expression)
            )

        if not desired_exists:
            logger.info(
                "Creating index %s on %s",
                requirement.index_name,
                requirement.collection,
            )
            await collection.create_indexes([requirement.to_index_model()])

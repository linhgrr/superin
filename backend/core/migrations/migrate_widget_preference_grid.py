"""One-time migration for widget preference layout fields."""

from __future__ import annotations

import asyncio

from motor.motor_asyncio import AsyncIOMotorClient

from core.config import settings


async def migrate() -> int:
    client = AsyncIOMotorClient(settings.mongodb_uri)
    try:
        database = client[settings.mongodb_database]
        collection = database["widget_preferences"]
        cursor = collection.find({"config": {"$type": "object"}})

        migrated = 0
        async for document in cursor:
            config = document.get("config") or {}
            update_fields: dict[str, object] = {}

            if isinstance(config.get("gridX"), int):
                update_fields["grid_x"] = config["gridX"]
            if isinstance(config.get("gridY"), int):
                update_fields["grid_y"] = config["gridY"]

            if not update_fields and "config" not in document:
                continue

            await collection.update_one(
                {"_id": document["_id"]},
                {"$set": update_fields, "$unset": {"config": ""}},
            )
            migrated += 1

        return migrated
    finally:
        client.close()


if __name__ == "__main__":
    count = asyncio.run(migrate())
    print(f"Migrated {count} widget preference documents")

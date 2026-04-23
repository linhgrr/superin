from types import SimpleNamespace
from typing import Any

import pytest

import shared.preference_utils as preference_utils
from shared.preference_utils import update_multiple_preferences
from shared.schemas import PreferenceUpdate


class FakeCollection:
    def __init__(self) -> None:
        self.operations: list[Any] = []
        self.ordered = False

    async def bulk_write(self, operations: list[Any], ordered: bool = False) -> None:
        self.operations = operations
        self.ordered = ordered


class FakeQuery:
    def __init__(self, items: list[Any]):
        self.items = items

    async def to_list(self) -> list[Any]:
        return self.items


class FakeField:
    def __init__(self, name: str) -> None:
        self.name = name

    def __eq__(self, other: object) -> bool:
        return self.name == str(other)


class FakeWidgetPreference:
    user_id = FakeField("user_id")
    app_id = FakeField("app_id")
    widget_id = FakeField("widget_id")
    collection = FakeCollection()
    items: list[Any] = []

    @staticmethod
    def get_pymongo_collection() -> FakeCollection:
        return FakeWidgetPreference.collection

    @staticmethod
    def find(*_args: object, **_kwargs: object) -> FakeQuery:
        return FakeQuery(FakeWidgetPreference.items)


async def test_update_multiple_preferences_upserts_missing_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    returned_pref = SimpleNamespace(widget_id="finance.total-balance")
    FakeWidgetPreference.collection = FakeCollection()
    FakeWidgetPreference.items = [returned_pref]

    monkeypatch.setattr(preference_utils, "WidgetPreference", FakeWidgetPreference)
    monkeypatch.setattr(preference_utils, "In", lambda field, values: ("in", field, values))

    result = await update_multiple_preferences(
        "64f000000000000000000001",
        [
            PreferenceUpdate(
                widget_id="finance.total-balance",
                enabled=True,
                grid_x=0,
                grid_y=4,
            )
        ],
        "finance",
    )

    assert result == [returned_pref]
    assert FakeWidgetPreference.collection.ordered is False
    assert len(FakeWidgetPreference.collection.operations) == 1

    operation = FakeWidgetPreference.collection.operations[0]
    assert operation._upsert is True
    assert operation._filter["app_id"] == "finance"
    assert operation._filter["widget_id"] == "finance.total-balance"
    assert operation._doc["$set"] == {
        "enabled": True,
        "grid_x": 0,
        "grid_y": 4,
    }
    assert operation._doc["$setOnInsert"] == {
        "user_id": operation._filter["user_id"],
        "app_id": "finance",
        "widget_id": "finance.total-balance",
        "sort_order": 0,
        "size_w": None,
        "size_h": None,
    }

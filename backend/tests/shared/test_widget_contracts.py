from beanie import PydanticObjectId
from pydantic import ValidationError

from core.models import WidgetDataConfig, WidgetPreference
from shared.schemas import (
    PreferenceUpdate,
    WidgetDataConfigUpdate,
    WidgetPreferenceSchema,
)


def test_widget_preference_has_grid_fields() -> None:
    pref = WidgetPreference(
        user_id=PydanticObjectId(),
        widget_id="finance.total-balance",
        app_id="finance",
        enabled=True,
        sort_order=0,
        grid_x=3,
        grid_y=2,
        size_w=6,
        size_h=2,
    )

    assert pref.grid_x == 3
    assert pref.grid_y == 2
    assert "config" not in pref.model_dump()


def test_widget_data_config_stores_config() -> None:
    doc = WidgetDataConfig(
        user_id=PydanticObjectId(),
        widget_id="finance.total-balance",
        config={"account_id": "vcb-123", "show_currency": True},
    )

    assert doc.config["account_id"] == "vcb-123"


def test_preference_update_uses_grid_fields() -> None:
    update = PreferenceUpdate(widget_id="finance.total-balance", grid_x=2, grid_y=3, size_w=6)

    assert update.grid_x == 2
    assert update.grid_y == 3


def test_preference_update_rejects_legacy_config_field() -> None:
    try:
        PreferenceUpdate.model_validate({
            "widget_id": "finance.total-balance",
            "config": {"gridX": 1},
        })
    except ValidationError:
        return

    raise AssertionError("PreferenceUpdate should reject legacy config field")


def test_widget_data_config_update_schema() -> None:
    update = WidgetDataConfigUpdate(
        widget_id="finance.total-balance",
        config={"account_id": "vcb-123", "show_currency": True},
    )

    assert update.config["account_id"] == "vcb-123"


def test_widget_preference_schema_has_grid_fields() -> None:
    schema = WidgetPreferenceSchema(
        widget_id="finance.total-balance",
        user_id="u1",
        app_id="finance",
        enabled=True,
        sort_order=0,
        grid_x=1,
        grid_y=2,
        size_w=6,
        size_h=2,
    )

    assert schema.grid_x == 1
    assert schema.grid_y == 2

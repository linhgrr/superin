from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import APIRouter

import core.verify as verify_module
from core.registry import PluginEntry
from shared.enums import WidgetSize
from shared.schemas import WidgetManifestSchema


class EmptyAgent:
    def tools(self) -> list[object]:
        return []


class StubTool:
    def __init__(self, name: str, description: str = "Tool description") -> None:
        self.name = name
        self.description = description


def build_plugin(app_id: str, *, tools: list[object] | None = None) -> PluginEntry:
    router = APIRouter()

    @router.get("/widgets")
    async def list_widgets() -> list[object]:
        return []

    @router.get("/preferences")
    async def get_preferences() -> list[object]:
        return []

    manifest = SimpleNamespace(
        id=app_id,
        name=app_id.title(),
        agent_description=f"{app_id} agent",
        models=[f"{app_id.title()}Model"],
        widgets=[
            SimpleNamespace(
                id=f"{app_id}.summary",
                size="standard",
                config_fields=None,
            )
        ],
    )
    model = type(
        f"{app_id.title()}Model",
        (),
        {"Settings": type("Settings", (), {"name": f"{app_id}_items"})},
    )
    return cast(PluginEntry, {
        "manifest": manifest,
        "agent": EmptyAgent() if tools is None else SimpleNamespace(tools=lambda: tools),
        "models": [model],
        "router": router,
    })


def test_verify_plugins_allows_same_internal_routes_across_different_app_prefixes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {
            "calendar": build_plugin("calendar"),
            "finance": build_plugin("finance"),
        },
    )

    errors, _warnings = verify_module.verify_plugins()

    assert not [error for error in errors if "Route collision" in error]


def test_verify_plugins_rejects_non_kebab_widget_suffix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = build_plugin("calendar")
    plugin["manifest"].widgets = [
        WidgetManifestSchema(
            id="calendar.WeeklySummary",
            name="Weekly Summary",
            description="Weekly summary widget",
            icon="Calendar",
            size=WidgetSize.STANDARD,
            config_fields=[],
        ),
    ]
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {"calendar": plugin},
    )

    errors, _warnings = verify_module.verify_plugins()

    assert any("suffix must be kebab-case" in error for error in errors)


def test_verify_plugins_rejects_invalid_manifest_id_format(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = build_plugin("calendar")
    plugin["manifest"].id = "calendar-app"
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {"calendar": plugin},
    )

    errors, _warnings = verify_module.verify_plugins()

    assert any("manifest.id 'calendar-app' is invalid" in error for error in errors)


def test_verify_plugins_validates_manifest_models_alignment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = build_plugin("calendar")
    plugin["manifest"].models = ["MissingModel"]
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {"calendar": plugin},
    )

    errors, warnings = verify_module.verify_plugins()

    assert any("model 'MissingModel' in manifest but not registered" in error for error in errors)
    assert any("registered in plugin models but missing in manifest.models" in warning for warning in warnings)


def test_verify_plugins_warns_on_blank_tool_description(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = build_plugin(
        "calendar",
        tools=[StubTool("calendar_find_events", description="")],
    )
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {"calendar": plugin},
    )

    _errors, warnings = verify_module.verify_plugins()

    assert any("has empty description" in warning for warning in warnings)


def test_verify_plugins_rejects_duplicate_tool_names_across_apps(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {
            "calendar": build_plugin("calendar", tools=[StubTool("shared_tool")]),
            "finance": build_plugin("finance", tools=[StubTool("shared_tool")]),
        },
    )

    errors, _warnings = verify_module.verify_plugins()

    assert any("conflicts with tool registered by 'calendar'" in error for error in errors)


# Root tool wrapper checks were removed as part of the LangGraph v2
# parallel refactor; child-agent tool policy now lives in centralized middleware.

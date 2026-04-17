from types import SimpleNamespace

from fastapi import APIRouter

import core.verify as verify_module


class EmptyAgent:
    def tools(self) -> list[object]:
        return []


def build_plugin(app_id: str) -> dict[str, object]:
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
        tools=[],
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
    return {
        "manifest": manifest,
        "agent": EmptyAgent(),
        "models": [model],
        "router": router,
    }


def test_verify_plugins_allows_same_internal_routes_across_different_app_prefixes(
    monkeypatch,
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


def test_verify_plugins_rejects_non_kebab_widget_suffix(monkeypatch) -> None:
    plugin = build_plugin("calendar")
    plugin["manifest"].widgets = [  # type: ignore[index]
        SimpleNamespace(id="calendar.WeeklySummary", size="standard", config_fields=None),
    ]
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {"calendar": plugin},
    )

    errors, _warnings = verify_module.verify_plugins()

    assert any("suffix must be kebab-case" in error for error in errors)


def test_verify_plugins_rejects_invalid_manifest_id_format(monkeypatch) -> None:
    plugin = build_plugin("calendar")
    plugin["manifest"].id = "calendar-app"  # type: ignore[index]
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {"calendar": plugin},
    )

    errors, _warnings = verify_module.verify_plugins()

    assert any("manifest.id 'calendar-app' is invalid" in error for error in errors)


def test_verify_plugins_validates_manifest_models_alignment(monkeypatch) -> None:
    plugin = build_plugin("calendar")
    plugin["manifest"].models = ["MissingModel"]  # type: ignore[index]
    monkeypatch.setattr(
        verify_module,
        "PLUGIN_REGISTRY",
        {"calendar": plugin},
    )

    errors, warnings = verify_module.verify_plugins()

    assert any("model 'MissingModel' in manifest but not registered" in error for error in errors)
    assert any("registered in plugin models but missing in manifest.models" in warning for warning in warnings)


# Root tool safe_tool_call checks were removed as part of the LangGraph v2
# parallel refactor (root no longer uses create_react_agent + LangChain tools).

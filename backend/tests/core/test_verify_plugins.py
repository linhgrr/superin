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

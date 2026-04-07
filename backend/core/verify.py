"""Startup plugin verification — runs before server accepts requests.

errors   → server WILL NOT start (RuntimeError).
warnings → server starts but logs to console.
"""

import inspect

from core.registry import PLUGIN_REGISTRY
from shared.enums import VALID_WIDGET_SIZES


def _uses_safe_tool_call(tool: object) -> bool | None:
    """Return whether a LangChain tool implementation uses safe_tool_call().

    Returns:
        True: implementation clearly uses safe_tool_call()
        False: implementation source is available and does not use it
        None: implementation source could not be inspected
    """
    callable_obj = getattr(tool, "coroutine", None) or getattr(tool, "func", None)
    if callable_obj is None:
        return None

    try:
        source = inspect.getsource(callable_obj)
    except (OSError, TypeError):
        return None

    return "safe_tool_call(" in source


def verify_plugins() -> tuple[list[str], list[str]]:
    """Validate all registered plugins against the manifest contract.

    Returns:
        errors:   list of error strings (fatal — server won't start)
        warnings: list of warning strings (non-fatal — server logs them)
    """
    errors: list[str] = []
    warnings: list[str] = []

    seen_widget_ids: dict[str, str] = {}
    seen_collection_names: set[str] = set()
    seen_app_ids: list[str] = []

    for app_id, plugin in PLUGIN_REGISTRY.items():
        m = plugin["manifest"]

        # ── Required manifest fields ─────────────────────────────────────────
        if not m.id:
            errors.append(f"[{app_id}] manifest.id is required")
        if not m.name:
            errors.append(f"[{app_id}] manifest.name is required")
        if not m.agent_description:
            warnings.append(
                f"[{app_id}] manifest.agent_description is empty — "
                "RootAgent will skip this app"
            )
        if not m.tools:
            warnings.append(f"[{app_id}] manifest.tools is empty — no agent tools available")
        if not m.widgets:
            warnings.append(f"[{app_id}] has no widgets")

        # ── Widget ID checks ────────────────────────────────────────────────
        for w in m.widgets:
            # Duplicate widget ID across ALL plugins
            if w.id in seen_widget_ids:
                errors.append(
                    f"[{app_id}] duplicate widget id '{w.id}' — "
                    f"already registered by '{seen_widget_ids[w.id]}'"
                )
            seen_widget_ids[w.id] = app_id

            # Format: {app_id}.{kebab-name}
            expected_prefix = f"{app_id}."
            if not w.id.startswith(expected_prefix):
                errors.append(
                    f"[{app_id}] widget '{w.id}' must start with '{expected_prefix}'"
                )

            # Valid size
            if w.size not in VALID_WIDGET_SIZES:
                errors.append(
                    f"[{app_id}] widget '{w.id}' has invalid size '{w.size}' — "
                    f"must be one of {VALID_WIDGET_SIZES}"
                )

            # Config field types
            for field in (w.config_fields or []):
                valid_types = {"text", "number", "select", "multi-select", "date", "boolean"}
                if field.type not in valid_types:
                    errors.append(
                        f"[{app_id}] widget '{w.id}' config field '{field.name}' "
                        f"has invalid type '{field.type}'"
                    )
                if field.type == "select" and not field.options and not field.options_source:
                    warnings.append(
                        f"[{app_id}] widget '{w.id}' select field '{field.name}' "
                        "has no options (consider options_source)"
                    )

        # ── Tool name checks ────────────────────────────────────────────────
        manifest_tools = set(m.tools)
        agent_tools = plugin["agent"].tools()
        registered_tools = {t.name for t in agent_tools}
        for tool_name in manifest_tools - registered_tools:
            errors.append(
                f"[{app_id}] tool '{tool_name}' in manifest but not registered in agent"
            )
        for tool_name in registered_tools - manifest_tools:
            warnings.append(
                f"[{app_id}] tool '{tool_name}' registered in agent but not in manifest "
                "(will be hidden from LLM)"
            )

        # Tool name format: {app_id}_{action}
        for tool_name in registered_tools:
            expected_prefix = f"{app_id}_"
            if not tool_name.startswith(expected_prefix):
                errors.append(
                    f"[{app_id}] tool '{tool_name}' must start with '{expected_prefix}'"
                )

        for tool_obj in agent_tools:
            tool_name = tool_obj.name
            uses_safe_tool_call = _uses_safe_tool_call(tool_obj)
            if uses_safe_tool_call is False:
                errors.append(
                    f"[{app_id}] tool '{tool_name}' must wrap its domain execution "
                    "with safe_tool_call()"
                )
            elif uses_safe_tool_call is None:
                warnings.append(
                    f"[{app_id}] tool '{tool_name}' could not be inspected for "
                    "safe_tool_call() usage"
                )

        # ── Beanie model checks ─────────────────────────────────────────────
        for model in plugin["models"]:
            coll_name = getattr(model, "Settings", None) and getattr(model.Settings, "name", None)
            if not coll_name:
                coll_name = model.__name__.lower()
            if coll_name in seen_collection_names:
                errors.append(
                    f"[{app_id}] collection name '{coll_name}' conflicts with another plugin"
                )
            seen_collection_names.add(coll_name)

        # ── Router checks ───────────────────────────────────────────────────
        if not plugin["router"].routes:
            warnings.append(f"[{app_id}] router has no routes — app endpoints unreachable")

        # ── App ID duplicate check ──────────────────────────────────────────
        if app_id in seen_app_ids:
            errors.append(f"Duplicate app_id '{app_id}' in registry")
        seen_app_ids.append(app_id)

    # ── Cross-plugin route collision check ────────────────────────────────
    seen_routes: dict[str, str] = {}  # (method, path) -> app_id
    for app_id, plugin in PLUGIN_REGISTRY.items():
        for route in plugin["router"].routes:
            path = route.path  # FastAPI guarantees APIRoute.path is never None
            methods = getattr(route, "methods", None) or {"GET"}
            for method in methods:
                key = f"{method.upper()} {path}"
                if key in seen_routes and seen_routes[key] != app_id:
                    errors.append(
                        f"Route collision: '{key}' registered by both "
                        f"'{seen_routes[key]}' and '{app_id}'"
                    )
                seen_routes[key] = app_id

    return errors, warnings

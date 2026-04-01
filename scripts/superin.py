#!/usr/bin/env python3
"""Unified CLI for Superin developer workflows."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from importlib import import_module
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent.parent.resolve()
BACKEND_ROOT = ROOT / "backend"
BACKEND_APPS = BACKEND_ROOT / "apps"
FRONTEND_ROOT = ROOT / "frontend"
FRONTEND_APPS = FRONTEND_ROOT / "src" / "apps"
SCRIPT_PATH = Path(__file__).resolve()

APP_ID_RE = re.compile(r"^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$")
RESERVED = {"auth", "catalog", "chat", "core", "shared", "apps"}
REQUIRES_LINHDZ = {"codegen", "manifests", "plugin"}


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def to_pascal_case(value: str) -> str:
    return "".join(part.capitalize() for part in value.split("-"))


def to_camel_case(value: str) -> str:
    pascal = to_pascal_case(value)
    return pascal[:1].lower() + pascal[1:]


def widget_suffix(widget_id: str) -> str:
    suffix = widget_id.split(".", 1)[1]
    return "".join(part.capitalize() for part in suffix.split("-"))


def widget_component_name(widget_id: str) -> str:
    return f"{widget_suffix(widget_id)}Widget"


def widget_file_name(widget_id: str) -> str:
    return f"{widget_component_name(widget_id)}.tsx"


def write_file(path: Path, content: str, *, overwrite: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not overwrite:
        return
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, payload: object, *, overwrite: bool) -> None:
    write_file(path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n", overwrite=overwrite)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def ensure_linhdz() -> None:
    if os.environ.get("CONDA_DEFAULT_ENV") == "linhdz":
        return
    if os.environ.get("SUPERIN_SKIP_REEXEC") == "1":
        return
    if shutil.which("conda") is None:
        fail("conda is required to run this command outside the linhdz environment")

    result = subprocess.run(
        ["conda", "run", "-n", "linhdz", "python", str(SCRIPT_PATH), *sys.argv[1:]],
        cwd=ROOT,
        env={**os.environ, "SUPERIN_SKIP_REEXEC": "1"},
    )
    raise SystemExit(result.returncode)


def import_backend_schemas() -> type:
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))
    from shared.schemas import AppManifestSchema  # type: ignore

    return AppManifestSchema


def load_backend_manifest(app_id: str) -> Any:
    app_manifest_type = import_backend_schemas()
    module = import_module(f"apps.{app_id}.manifest")
    for value in vars(module).values():
        if isinstance(value, app_manifest_type):
            return value
    fail(f"could not find AppManifestSchema in backend/apps/{app_id}/manifest.py")


def load_backend_manifests() -> list[Any]:
    manifests: list[Any] = []
    for app_dir in sorted(BACKEND_APPS.iterdir()):
        if not app_dir.is_dir() or app_dir.name.startswith("__"):
            continue
        manifest_path = app_dir / "manifest.py"
        if not manifest_path.exists():
            continue
        manifests.append(load_backend_manifest(app_dir.name))
    return manifests


def load_frontend_manifest(app_id: str) -> dict[str, Any]:
    manifest_path = FRONTEND_APPS / app_id / "manifest.json"
    if not manifest_path.exists():
        fail(f"missing frontend manifest: {manifest_path.relative_to(ROOT)}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def sync_frontend_registry() -> None:
    app_ids = sorted(
        entry.name
        for entry in FRONTEND_APPS.iterdir()
        if entry.is_dir() and (entry / "manifest.json").exists()
    )

    imports = [
        f'import {{ {to_camel_case(app_id)}App }} from "./{app_id}";'
        for app_id in app_ids
    ]
    entries = [f"  {app_id}: {to_camel_case(app_id)}App," for app_id in app_ids]
    content = (
        "\n".join(imports)
        + '\nimport type { FrontendAppDefinition } from "./types";\n\n'
        + "export const FRONTEND_APPS = {\n"
        + "\n".join(entries)
        + '\n} as const satisfies Record<string, FrontendAppDefinition>;\n\n'
        + "export function getFrontendApp(appId: string) {\n"
        + "  return FRONTEND_APPS[appId as keyof typeof FRONTEND_APPS];\n"
        + "}\n"
    )
    write_file(FRONTEND_APPS / "index.ts", content, overwrite=True)


def sync_frontend_app(app_id: str, *, force_widgets: bool = False) -> None:
    manifest = load_backend_manifest(app_id)
    app_name = manifest.name
    app_root = FRONTEND_APPS / app_id
    ensure_dir(app_root)

    write_json(
        app_root / "manifest.json",
        {
            "id": manifest.id,
            "name": manifest.name,
            "widgets": [{"id": widget.id, "size": widget.size} for widget in manifest.widgets],
        },
        overwrite=True,
    )

    app_export = f"{to_camel_case(app_id)}App"
    write_file(
        app_root / "index.ts",
        (
            'import manifest from "./manifest.json";\n'
            'import AppView from "./AppView";\n'
            'import DashboardWidget from "./DashboardWidget";\n'
            'import type { FrontendAppDefinition, FrontendAppManifest } from "../types";\n\n'
            f"const {to_camel_case(app_id)}Manifest = manifest as FrontendAppManifest;\n\n"
            f"export const {app_export} = {{\n"
            f"  manifest: {to_camel_case(app_id)}Manifest,\n"
            "  AppView,\n"
            "  DashboardWidget,\n"
            "} satisfies FrontendAppDefinition;\n"
        ),
        overwrite=True,
    )

    write_file(app_root / "AppView.tsx", f'export {{ default }} from "./views/{app_name}Screen";\n', overwrite=True)
    write_file(
        app_root / "DashboardWidget.tsx",
        f'export {{ default }} from "./widgets/{app_name}DashboardWidget";\n',
        overwrite=True,
    )

    api_path = app_root / "api.ts"
    if not api_path.exists():
        plural = f"{app_name.lower()}s"
        write_file(
            api_path,
            (
                'import { api } from "@/api/client";\n\n'
                f'const BASE = "/api/apps/{app_id}";\n\n'
                "export interface ItemRead {\n"
                "  id: string;\n"
                "  title: string;\n"
                "  description: string | null;\n"
                "  created_at: string;\n"
                "}\n\n"
                f"export async function getItems(): Promise<ItemRead[]> {{\n"
                f'  return api.get<ItemRead[]>(`${{BASE}}/{plural}`);\n'
                "}\n"
            ),
            overwrite=False,
        )

    views_dir = app_root / "views"
    widgets_dir = app_root / "widgets"
    for directory in [app_root / "components", app_root / "features", views_dir, widgets_dir, app_root / "lib"]:
        ensure_dir(directory)
        gitkeep = directory / ".gitkeep"
        if not any(directory.iterdir()):
            write_file(gitkeep, "", overwrite=False)

    screen_path = views_dir / f"{app_name}Screen.tsx"
    if not screen_path.exists():
        write_file(
            screen_path,
            (
                f"export default function {app_name}Screen() {{\n"
                "  return (\n"
                "    <div>\n"
                f'      <h2 style={{{{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}}}>{app_name}</h2>\n'
                f'      <p style={{{{ color: "var(--color-muted)", marginTop: "0.5rem" }}}}>TODO: compose the {app_name} app page from features and components.</p>\n'
                "    </div>\n"
                "  );\n"
                "}\n"
            ),
            overwrite=False,
        )

    imports: list[str] = []
    mappings: list[str] = []
    for widget in manifest.widgets:
        component_name = widget_component_name(widget.id)
        imports.append(f'import {component_name} from "./{component_name}";')
        mappings.append(f'  "{widget.id}": {component_name},')
        widget_path = widgets_dir / widget_file_name(widget.id)
        if not widget_path.exists() or force_widgets:
            write_file(
                widget_path,
                (
                    'import type { DashboardWidgetRendererProps } from "../types";\n\n'
                    f"export default function {component_name}({{ widget }}: DashboardWidgetRendererProps) {{\n"
                    "  return (\n"
                    "    <div>\n"
                    '      <p className="section-label">{widget.name}</p>\n'
                    '      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>\n'
                    "        {widget.description}\n"
                    "      </p>\n"
                    "    </div>\n"
                    "  );\n"
                    "}\n"
                ),
                overwrite=True,
            )

    dispatcher = (
        'import type { ComponentType } from "react";\n'
        'import type { DashboardWidgetProps, DashboardWidgetRendererProps } from "../types";\n'
        + "\n".join(imports)
        + "\n\n"
        + "const WIDGET_COMPONENTS = {\n"
        + "\n".join(mappings)
        + '\n} as const satisfies Record<string, ComponentType<DashboardWidgetRendererProps>>;\n\n'
        + f"export default function {app_name}DashboardWidget({{ widgetId, widget }}: DashboardWidgetProps) {{\n"
        + "  const Component = WIDGET_COMPONENTS[widgetId as keyof typeof WIDGET_COMPONENTS];\n\n"
        + "  if (Component) {\n"
        + "    return <Component widget={widget} />;\n"
        + "  }\n\n"
        + "  return (\n"
        + "    <div>\n"
        + '      <p className="section-label">{widget.name}</p>\n'
        + '      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>\n'
        + "        {widget.description}\n"
        + "      </p>\n"
        + "    </div>\n"
        + "  );\n"
        + "}\n"
    )
    write_file(widgets_dir / f"{app_name}DashboardWidget.tsx", dispatcher, overwrite=True)
    sync_frontend_registry()


def validate_manifests() -> None:
    backend_manifests = load_backend_manifests()
    backend_by_id = {manifest.id: manifest for manifest in backend_manifests}

    frontend_app_dirs = sorted(
        entry.name
        for entry in FRONTEND_APPS.iterdir()
        if entry.is_dir() and (entry / "manifest.json").exists()
    )
    frontend_by_id = {app_id: load_frontend_manifest(app_id) for app_id in frontend_app_dirs}

    if sorted(backend_by_id) != sorted(frontend_by_id):
        fail(
            "manifest validation failed: app ids differ.\n"
            f"frontend: {', '.join(sorted(frontend_by_id))}\n"
            f"backend: {', '.join(sorted(backend_by_id))}",
        )

    for app_id, frontend_manifest in frontend_by_id.items():
        app_root = FRONTEND_APPS / app_id
        for required_file in ["AppView.tsx", "DashboardWidget.tsx", "api.ts", "index.ts"]:
            if not (app_root / required_file).exists():
                fail(f"manifest validation failed: missing frontend app file: {(app_root / required_file).relative_to(ROOT)}")
        for required_dir in ["components", "features", "views", "widgets", "lib"]:
            if not (app_root / required_dir).exists():
                fail(f"manifest validation failed: missing frontend app dir: {(app_root / required_dir).relative_to(ROOT)}")

        backend_manifest = backend_by_id[app_id]
        frontend_widgets = {widget["id"]: widget["size"] for widget in frontend_manifest["widgets"]}
        backend_widgets = {widget.id: widget.size for widget in backend_manifest.widgets}

        if sorted(frontend_widgets) != sorted(backend_widgets):
            fail(
                f"manifest validation failed: widget ids differ for {app_id}.\n"
                f"frontend: {', '.join(sorted(frontend_widgets))}\n"
                f"backend: {', '.join(sorted(backend_widgets))}",
            )

        for widget_id, backend_size in backend_widgets.items():
            if frontend_widgets[widget_id] != backend_size:
                fail(
                    f"manifest validation failed: widget size differs for {widget_id}. "
                    f"frontend={frontend_widgets[widget_id]} backend={backend_size}",
                )
            expected_widget_file = app_root / "widgets" / widget_file_name(widget_id)
            if not expected_widget_file.exists():
                fail(
                    f"manifest validation failed: missing widget renderer file for {widget_id}: "
                    f"{expected_widget_file.relative_to(ROOT)}",
                )

    print(
        f"manifest validation passed for {len(backend_manifests)} apps and "
        f"{sum(len(manifest.widgets) for manifest in backend_manifests)} widgets",
    )


def run_codegen() -> None:
    from codegen import main as codegen_main

    codegen_main()


def validate_app_id(app_id: str) -> str:
    if not APP_ID_RE.match(app_id):
        raise ValueError(
            f"app_id '{app_id}' is invalid. Use kebab-case, e.g. 'finance' or 'health-tracker'.",
        )
    if len(app_id) > 30:
        raise ValueError(f"app_id '{app_id}' exceeds 30 chars.")
    if app_id in RESERVED:
        raise ValueError(f"app_id '{app_id}' is reserved.")
    if (BACKEND_APPS / app_id).exists():
        raise ValueError(f"Plugin '{app_id}' already exists at backend/apps/{app_id}/")
    return app_id


def scaffold_backend(app_id: str, model_name: str) -> None:
    app_name = to_pascal_case(app_id)
    plural = f"{model_name.lower()}s"
    manifest_var = f"{app_id}_manifest"
    backend_dir = BACKEND_APPS / app_id

    write_file(
        backend_dir / "__init__.py",
        f'''"""Auto-register the {app_name} plugin."""\n\nfrom core.registry import register_plugin\n\nfrom .agent import {app_name}Agent\nfrom .manifest import {manifest_var}\nfrom .models import {model_name}\nfrom .routes import router\n\nregister_plugin(\n    manifest={manifest_var},\n    agent={app_name}Agent(),\n    router=router,\n    models=[{model_name}],\n)\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "manifest.py",
        f'''"""Manifest for the {app_name} plugin."""\n\nfrom shared.schemas import AppManifestSchema, WidgetManifestSchema\n\nsummary_widget = WidgetManifestSchema(\n    id="{app_id}.summary",\n    name="{app_name} Summary",\n    description="Shows a quick summary for the {app_name} app.",\n    icon="Box",\n    size="medium",\n)\n\n{manifest_var} = AppManifestSchema(\n    id="{app_id}",\n    name="{app_name}",\n    version="1.0.0",\n    description="TODO: describe what the {app_name} app does.",\n    icon="Box",\n    color="oklch(0.65 0.21 280)",\n    widgets=[summary_widget],\n    agent_description="Handles {app_name.lower()} questions and actions.",\n    tools=["{app_id}_list_{plural}", "{app_id}_create_{model_name.lower()}", "{app_id}_delete_{model_name.lower()}"],\n    models=["{model_name}"],\n    category="other",\n    tags=["{app_id}"],\n    author="Shin Team",\n)\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "models.py",
        f'''"""Beanie models for the {app_name} plugin."""\n\nfrom datetime import datetime\n\nfrom beanie import Document, PydanticObjectId\nfrom pydantic import Field\n\n\nclass {model_name}(Document):\n    user_id: PydanticObjectId\n    title: str\n    description: str | None = None\n    created_at: datetime = Field(default_factory=datetime.utcnow)\n\n    class Settings:\n        name = "{app_id}_{plural}"\n        indexes = [[("user_id", 1)]]\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "repository.py",
        f'''"""Repository layer for the {app_name} plugin."""\n\nfrom beanie import PydanticObjectId\n\nfrom .models import {model_name}\n\n\nclass {model_name}Repository:\n    async def list_for_user(self, user_id: str, limit: int = 50) -> list[{model_name}]:\n        return await {model_name}.find(\n            {model_name}.user_id == PydanticObjectId(user_id),\n        ).sort("-created_at").limit(limit).to_list()\n\n    async def find_by_id(self, item_id: str, user_id: str) -> {model_name} | None:\n        return await {model_name}.find_one(\n            {model_name}.id == PydanticObjectId(item_id),\n            {model_name}.user_id == PydanticObjectId(user_id),\n        )\n\n    async def create(self, user_id: str, title: str, description: str | None = None) -> {model_name}:\n        item = {model_name}(\n            user_id=PydanticObjectId(user_id),\n            title=title,\n            description=description,\n        )\n        await item.insert()\n        return item\n\n    async def delete(self, item: {model_name}) -> None:\n        await item.delete()\n\n    async def delete_all_by_user(self, user_id: str) -> int:\n        count = 0\n        async for item in {model_name}.find({model_name}.user_id == PydanticObjectId(user_id)):\n            await item.delete()\n            count += 1\n        return count\n\n\n{model_name.lower()}_repository = {model_name}Repository()\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "service.py",
        f'''"""Service layer for the {app_name} plugin."""\n\nfrom .models import {model_name}\nfrom .repository import {model_name}Repository, {model_name.lower()}_repository\n\n\nclass {model_name}Service:\n    def __init__(self) -> None:\n        self.repo: {model_name}Repository = {model_name.lower()}_repository\n\n    async def list_items(self, user_id: str, limit: int = 50) -> list[dict]:\n        items = await self.repo.list_for_user(user_id, limit)\n        return [_to_dict(item) for item in items]\n\n    async def create_item(self, user_id: str, title: str, description: str | None = None) -> dict:\n        if not title.strip():\n            raise ValueError("Title cannot be empty")\n        item = await self.repo.create(user_id, title, description)\n        return _to_dict(item)\n\n    async def delete_item(self, item_id: str, user_id: str) -> dict:\n        item = await self.repo.find_by_id(item_id, user_id)\n        if not item:\n            raise ValueError("{model_name} not found")\n        await self.repo.delete(item)\n        return {{"success": True, "id": item_id}}\n\n    async def on_install(self, user_id: str) -> None:\n        await self.create_item(user_id, "Welcome to {app_name}!", "Replace this seeded item with your real default data.")\n\n    async def on_uninstall(self, user_id: str) -> None:\n        await self.repo.delete_all_by_user(user_id)\n\n\ndef _to_dict(item: {model_name}) -> dict:\n    return {{"id": str(item.id), "title": item.title, "description": item.description, "created_at": item.created_at.isoformat()}}\n\n\n{model_name.lower()}_service = {model_name}Service()\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "schemas.py",
        f'''"""Request schemas for the {app_name} plugin."""\n\nfrom pydantic import BaseModel, Field\n\n\nclass Create{model_name}Request(BaseModel):\n    title: str = Field(min_length=1, max_length=200)\n    description: str | None = None\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "tools.py",
        f'''"""LangGraph tools for the {app_name} plugin."""\n\nfrom langchain_core.tools import tool\n\nfrom .service import {model_name.lower()}_service\nfrom shared.agent_context import get_user_context\n\n\n@tool\nasync def {app_id}_list_{plural}(limit: int = 20) -> list[dict]:\n    """List {app_name.lower()} items for the current user."""\n    user_id = get_user_context()\n    return await {model_name.lower()}_service.list_items(user_id, limit)\n\n\n@tool\nasync def {app_id}_create_{model_name.lower()}(title: str, description: str | None = None) -> dict:\n    """Create a new {app_name.lower()} item."""\n    user_id = get_user_context()\n    return await {model_name.lower()}_service.create_item(user_id, title, description)\n\n\n@tool\nasync def {app_id}_delete_{model_name.lower()}(item_id: str) -> dict:\n    """Delete a {app_name.lower()} item by id."""\n    user_id = get_user_context()\n    return await {model_name.lower()}_service.delete_item(item_id, user_id)\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "prompts.py",
        f'''"""Prompt helpers for the {app_name} child agent."""\n\n\ndef get_{app_id.replace("-", "_")}_prompt() -> str:\n    return """You are the {app_name} app assistant.\nHelp the user with {app_name.lower()}-related tasks.\nUse tools when needed and keep responses concise."""\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "agent.py",
        f'''"""Child LangGraph agent for the {app_name} plugin."""\n\nfrom langchain_core.tools import BaseTool\n\nfrom core.agents.base_app import BaseAppAgent\nfrom shared.agent_context import set_user_context\n\nfrom .prompts import get_{app_id.replace("-", "_")}_prompt\nfrom .service import {model_name.lower()}_service\nfrom .tools import {app_id}_create_{model_name.lower()}, {app_id}_delete_{model_name.lower()}, {app_id}_list_{plural}\n\n\nclass {app_name}Agent(BaseAppAgent):\n    app_id = "{app_id}"\n\n    def tools(self) -> list[BaseTool]:\n        return [{app_id}_list_{plural}, {app_id}_create_{model_name.lower()}, {app_id}_delete_{model_name.lower()}]\n\n    def build_prompt(self) -> str:\n        return get_{app_id.replace("-", "_")}_prompt()\n\n    async def on_install(self, user_id: str) -> None:\n        set_user_context(user_id)\n        await {model_name.lower()}_service.on_install(user_id)\n\n    async def on_uninstall(self, user_id: str) -> None:\n        set_user_context(user_id)\n        await {model_name.lower()}_service.on_uninstall(user_id)\n''',
        overwrite=False,
    )
    write_file(
        backend_dir / "routes.py",
        f'''"""FastAPI routes for the {app_name} plugin."""\n\nfrom fastapi import APIRouter, Depends, HTTPException, Query\nfrom beanie import PydanticObjectId\n\nfrom core.auth import get_current_user\nfrom core.models import WidgetPreference\nfrom shared.schemas import PreferenceUpdate, WidgetPreferenceSchema\n\nfrom .manifest import {manifest_var}\nfrom .schemas import Create{model_name}Request\nfrom .service import {model_name.lower()}_service\n\nrouter = APIRouter()\n\n\n@router.get("/widgets")\nasync def list_widgets():\n    return {manifest_var}.widgets\n\n\n@router.get("/{model_name.lower()}s")\nasync def list_items(user_id: str = Depends(get_current_user), limit: int = Query(20, le=100)):\n    return await {model_name.lower()}_service.list_items(user_id, limit)\n\n\n@router.post("/{model_name.lower()}s")\nasync def create_item(request: Create{model_name}Request, user_id: str = Depends(get_current_user)):\n    try:\n        return await {model_name.lower()}_service.create_item(user_id, request.title, request.description)\n    except ValueError as exc:\n        raise HTTPException(status_code=400, detail=str(exc)) from exc\n\n\n@router.delete("/{model_name.lower()}s/{{item_id}}")\nasync def delete_item(item_id: str, user_id: str = Depends(get_current_user)):\n    try:\n        return await {model_name.lower()}_service.delete_item(item_id, user_id)\n    except ValueError as exc:\n        raise HTTPException(status_code=404, detail=str(exc)) from exc\n\n\n@router.get("/preferences")\nasync def get_preferences(user_id: str = Depends(get_current_user)) -> list[WidgetPreferenceSchema]:\n    prefs = await WidgetPreference.find(\n        WidgetPreference.user_id == PydanticObjectId(user_id),\n        WidgetPreference.app_id == "{app_id}",\n    ).to_list()\n    return [WidgetPreferenceSchema(id=str(pref.id), user_id=str(pref.user_id), widget_id=pref.widget_id, app_id=pref.app_id, enabled=pref.enabled, position=pref.position, config=pref.config) for pref in prefs]\n\n\n@router.put("/preferences")\nasync def update_preferences(updates: list[PreferenceUpdate], user_id: str = Depends(get_current_user)) -> list[WidgetPreferenceSchema]:\n    for update in updates:\n        pref = await WidgetPreference.find_one(\n            WidgetPreference.user_id == PydanticObjectId(user_id),\n            WidgetPreference.app_id == "{app_id}",\n            WidgetPreference.widget_id == update.widget_id,\n        )\n        if pref:\n            if update.enabled is not None:\n                pref.enabled = update.enabled\n            if update.position is not None:\n                pref.position = update.position\n            if update.config is not None:\n                pref.config = update.config\n            await pref.save()\n    return await get_preferences(user_id)\n''',
        overwrite=False,
    )


def run_dev(frontend_delay: float) -> None:
    backend = subprocess.Popen(["npm", "run", "dev:backend"], cwd=ROOT)
    children = [backend]
    try:
        time.sleep(frontend_delay)
        frontend = subprocess.Popen(["npm", "run", "dev:frontend"], cwd=ROOT)
        children.append(frontend)

        def shutdown(signum: int, _frame: Any) -> None:
            for child in children:
                if child.poll() is None:
                    child.terminate()
            raise SystemExit(0 if signum in (signal.SIGINT, signal.SIGTERM) else 1)

        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)

        while True:
            for child in children:
                code = child.poll()
                if code is not None and code != 0:
                    for other in children:
                        if other is not child and other.poll() is None:
                            other.terminate()
                    raise SystemExit(code)
            time.sleep(0.5)
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Superin developer CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("codegen", help="Generate OpenAPI and frontend TS types")

    manifests = subparsers.add_parser("manifests", help="Manifest workflows")
    manifests_sub = manifests.add_subparsers(dest="manifests_command", required=True)
    manifests_sub.add_parser("validate", help="Validate backend/frontend manifest integrity")

    plugin = subparsers.add_parser("plugin", help="Plugin workflows")
    plugin_sub = plugin.add_subparsers(dest="plugin_command", required=True)

    plugin_create = plugin_sub.add_parser("create", help="Scaffold a new plugin")
    plugin_create.add_argument("app_id")
    plugin_create.add_argument("--model", default=None)
    plugin_create.add_argument("--no-frontend", dest="create_frontend", action="store_false", default=True)

    plugin_sync = plugin_sub.add_parser("sync-fe", help="Sync frontend app scaffolding from backend manifest")
    plugin_sync.add_argument("app_id", nargs="?")
    plugin_sync.add_argument("--all", action="store_true")
    plugin_sync.add_argument("--force-widgets", action="store_true")

    dev = subparsers.add_parser("dev", help="Run backend then frontend dev servers")
    dev.add_argument("--frontend-delay", type=float, default=1.5)

    return parser


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] in REQUIRES_LINHDZ:
        ensure_linhdz()

    parser = build_parser()
    args = parser.parse_args()

    if args.command == "codegen":
        run_codegen()
        return

    if args.command == "manifests" and args.manifests_command == "validate":
        validate_manifests()
        return

    if args.command == "plugin" and args.plugin_command == "create":
        try:
            app_id = validate_app_id(args.app_id)
        except ValueError as exc:
            fail(str(exc))
        model_name = args.model or to_pascal_case(app_id)
        scaffold_backend(app_id, model_name)
        if args.create_frontend:
            sync_frontend_app(app_id)
        sync_frontend_registry()
        print(f"created plugin scaffold for {app_id}")
        return

    if args.command == "plugin" and args.plugin_command == "sync-fe":
        if args.all:
            for manifest in load_backend_manifests():
                sync_frontend_app(manifest.id, force_widgets=args.force_widgets)
            print("synced frontend app scaffolding for all backend manifests")
            return
        if not args.app_id:
            fail("plugin sync-fe requires <app_id> or --all")
        sync_frontend_app(args.app_id, force_widgets=args.force_widgets)
        print(f"synced frontend app scaffolding for {args.app_id}")
        return

    if args.command == "dev":
        run_dev(args.frontend_delay)
        return


if __name__ == "__main__":
    main()

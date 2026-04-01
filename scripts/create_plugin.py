#!/usr/bin/env python3
"""
create_plugin.py — scaffold a Shin SuperApp plugin using the current FE/BE protocol.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
BACKEND_APPS = ROOT / "backend" / "apps"
FRONTEND_APPS = ROOT / "frontend" / "src" / "apps"

APP_ID_RE = re.compile(r"^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$")
RESERVED = {"auth", "catalog", "chat", "core", "shared", "apps"}


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


def to_class_name(app_id: str) -> str:
    return "".join(part.capitalize() for part in app_id.split("-"))


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        print(f"  ~ {path.relative_to(ROOT)}  [exists — skipped]")
        return
    path.write_text(content, encoding="utf-8")
    print(f"  + {path.relative_to(ROOT)}")


def write_json(path: Path, payload: object) -> None:
    write(path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def scaffold_backend(app_id: str, app_name: str, model_name: str) -> None:
    backend_dir = BACKEND_APPS / app_id
    plural = f"{model_name.lower()}s"
    manifest_var = f"{app_id}_manifest"

    write(
        backend_dir / "__init__.py",
        f'''"""Auto-register the {app_name} plugin."""\n\nfrom core.registry import register_plugin\n\nfrom .agent import {app_name}Agent\nfrom .manifest import {manifest_var}\nfrom .models import {model_name}\nfrom .routes import router\n\nregister_plugin(\n    manifest={manifest_var},\n    agent={app_name}Agent(),\n    router=router,\n    models=[{model_name}],\n)\n''',
    )

    write(
        backend_dir / "manifest.py",
        f'''"""Manifest for the {app_name} plugin."""\n\nfrom shared.schemas import AppManifestSchema, WidgetManifestSchema\n\nsummary_widget = WidgetManifestSchema(\n    id="{app_id}.summary",\n    name="{app_name} Summary",\n    description="Shows a quick summary for the {app_name} app.",\n    icon="{app_name}",\n    size="medium",\n)\n\n{manifest_var} = AppManifestSchema(\n    id="{app_id}",\n    name="{app_name}",\n    version="1.0.0",\n    description="TODO: describe what the {app_name} app does.",\n    icon="{app_name}",\n    color="oklch(0.65 0.21 280)",\n    widgets=[summary_widget],\n    agent_description="Handles {app_name.lower()} questions and actions.",\n    tools=["{app_id}_list_{plural}", "{app_id}_create_{model_name.lower()}", "{app_id}_delete_{model_name.lower()}"],\n    models=["{model_name}"],\n    category="other",\n    tags=["{app_id}"],\n    author="Shin Team",\n)\n''',
    )

    write(
        backend_dir / "models.py",
        f'''"""Beanie models for the {app_name} plugin."""\n\nfrom datetime import datetime\n\nfrom beanie import Document, PydanticObjectId\nfrom pydantic import Field\n\n\nclass {model_name}(Document):\n    user_id: PydanticObjectId\n    title: str\n    description: str | None = None\n    created_at: datetime = Field(default_factory=datetime.utcnow)\n\n    class Settings:\n        name = "{app_id}_{plural}"\n        indexes = [\n            [("user_id", 1)],\n        ]\n''',
    )

    write(
        backend_dir / "repository.py",
        f'''"""Repository layer for the {app_name} plugin."""\n\nfrom beanie import PydanticObjectId\n\nfrom .models import {model_name}\n\n\nclass {model_name}Repository:\n    async def list_for_user(self, user_id: str, limit: int = 50) -> list[{model_name}]:\n        return await {model_name}.find(\n            {model_name}.user_id == PydanticObjectId(user_id),\n        ).sort("-created_at").limit(limit).to_list()\n\n    async def find_by_id(self, item_id: str, user_id: str) -> {model_name} | None:\n        return await {model_name}.find_one(\n            {model_name}.id == PydanticObjectId(item_id),\n            {model_name}.user_id == PydanticObjectId(user_id),\n        )\n\n    async def create(self, user_id: str, title: str, description: str | None = None) -> {model_name}:\n        item = {model_name}(\n            user_id=PydanticObjectId(user_id),\n            title=title,\n            description=description,\n        )\n        await item.insert()\n        return item\n\n    async def delete(self, item: {model_name}) -> None:\n        await item.delete()\n\n    async def delete_all_by_user(self, user_id: str) -> int:\n        count = 0\n        async for item in {model_name}.find({model_name}.user_id == PydanticObjectId(user_id)):\n            await item.delete()\n            count += 1\n        return count\n\n\n{model_name.lower()}_repository = {model_name}Repository()\n''',
    )

    write(
        backend_dir / "service.py",
        f'''"""Service layer for the {app_name} plugin."""\n\nfrom .models import {model_name}\nfrom .repository import {model_name}Repository, {model_name.lower()}_repository\n\n\nclass {model_name}Service:\n    def __init__(self) -> None:\n        self.repo: {model_name}Repository = {model_name.lower()}_repository\n\n    async def list_items(self, user_id: str, limit: int = 50) -> list[dict]:\n        items = await self.repo.list_for_user(user_id, limit)\n        return [_to_dict(item) for item in items]\n\n    async def create_item(self, user_id: str, title: str, description: str | None = None) -> dict:\n        if not title.strip():\n            raise ValueError("Title cannot be empty")\n        item = await self.repo.create(user_id, title, description)\n        return _to_dict(item)\n\n    async def delete_item(self, item_id: str, user_id: str) -> dict:\n        item = await self.repo.find_by_id(item_id, user_id)\n        if not item:\n            raise ValueError("{model_name} not found")\n        await self.repo.delete(item)\n        return {{"success": True, "id": item_id}}\n\n    async def on_install(self, user_id: str) -> None:\n        await self.create_item(user_id, "Welcome to {app_name}!", "Replace this seeded item with your real default data.")\n\n    async def on_uninstall(self, user_id: str) -> None:\n        await self.repo.delete_all_by_user(user_id)\n\n\ndef _to_dict(item: {model_name}) -> dict:\n    return {{\n        "id": str(item.id),\n        "title": item.title,\n        "description": item.description,\n        "created_at": item.created_at.isoformat(),\n    }}\n\n\n{model_name.lower()}_service = {model_name}Service()\n''',
    )

    write(
        backend_dir / "schemas.py",
        f'''"""Request schemas for the {app_name} plugin."""\n\nfrom pydantic import BaseModel, Field\n\n\nclass Create{model_name}Request(BaseModel):\n    title: str = Field(min_length=1, max_length=200)\n    description: str | None = None\n''',
    )

    write(
        backend_dir / "tools.py",
        f'''"""LangGraph tools for the {app_name} plugin."""\n\nfrom langchain_core.tools import tool\n\nfrom .service import {model_name.lower()}_service\nfrom shared.agent_context import get_user_context\n\n\n@tool\nasync def {app_id}_list_{plural}(limit: int = 20) -> list[dict]:\n    """List {app_name.lower()} items for the current user."""\n    user_id = get_user_context()\n    return await {model_name.lower()}_service.list_items(user_id, limit)\n\n\n@tool\nasync def {app_id}_create_{model_name.lower()}(title: str, description: str | None = None) -> dict:\n    """Create a new {app_name.lower()} item."""\n    user_id = get_user_context()\n    return await {model_name.lower()}_service.create_item(user_id, title, description)\n\n\n@tool\nasync def {app_id}_delete_{model_name.lower()}(item_id: str) -> dict:\n    """Delete a {app_name.lower()} item by id."""\n    user_id = get_user_context()\n    return await {model_name.lower()}_service.delete_item(item_id, user_id)\n''',
    )

    write(
        backend_dir / "prompts.py",
        f'''"""Prompt helpers for the {app_name} child agent."""\n\n\ndef get_{app_id.replace("-", "_")}_prompt() -> str:\n    return """You are the {app_name} app assistant.\nHelp the user with {app_name.lower()}-related tasks.\nUse tools when needed and keep responses concise."""\n''',
    )

    write(
        backend_dir / "agent.py",
        f'''"""Child LangGraph agent for the {app_name} plugin."""\n\nfrom langchain_core.tools import BaseTool\n\nfrom core.agents.base_app import BaseAppAgent\nfrom shared.agent_context import set_user_context\n\nfrom .prompts import get_{app_id.replace("-", "_")}_prompt\nfrom .service import {model_name.lower()}_service\nfrom .tools import (\n    {app_id}_create_{model_name.lower()},\n    {app_id}_delete_{model_name.lower()},\n    {app_id}_list_{plural},\n)\n\n\nclass {app_name}Agent(BaseAppAgent):\n    app_id = "{app_id}"\n\n    def tools(self) -> list[BaseTool]:\n        return [\n            {app_id}_list_{plural},\n            {app_id}_create_{model_name.lower()},\n            {app_id}_delete_{model_name.lower()},\n        ]\n\n    def build_prompt(self) -> str:\n        return get_{app_id.replace("-", "_")}_prompt()\n\n    async def on_install(self, user_id: str) -> None:\n        set_user_context(user_id)\n        await {model_name.lower()}_service.on_install(user_id)\n\n    async def on_uninstall(self, user_id: str) -> None:\n        set_user_context(user_id)\n        await {model_name.lower()}_service.on_uninstall(user_id)\n''',
    )

    write(
        backend_dir / "routes.py",
        f'''"""FastAPI routes for the {app_name} plugin."""\n\nfrom fastapi import APIRouter, Depends, HTTPException, Query\nfrom beanie import PydanticObjectId\n\nfrom core.auth import get_current_user\nfrom core.models import WidgetPreference\nfrom shared.schemas import PreferenceUpdate, WidgetPreferenceSchema\n\nfrom .manifest import {manifest_var}\nfrom .schemas import Create{model_name}Request\nfrom .service import {model_name.lower()}_service\n\nrouter = APIRouter()\n\n\n@router.get("/widgets")\nasync def list_widgets():\n    return {manifest_var}.widgets\n\n\n@router.get("/{plural}")\nasync def list_items(\n    user_id: str = Depends(get_current_user),\n    limit: int = Query(20, le=100),\n):\n    return await {model_name.lower()}_service.list_items(user_id, limit)\n\n\n@router.post("/{plural}")\nasync def create_item(\n    request: Create{model_name}Request,\n    user_id: str = Depends(get_current_user),\n):\n    try:\n        return await {model_name.lower()}_service.create_item(user_id, request.title, request.description)\n    except ValueError as exc:\n        raise HTTPException(status_code=400, detail=str(exc)) from exc\n\n\n@router.delete("/{plural}/{{item_id}}")\nasync def delete_item(item_id: str, user_id: str = Depends(get_current_user)):\n    try:\n        return await {model_name.lower()}_service.delete_item(item_id, user_id)\n    except ValueError as exc:\n        raise HTTPException(status_code=404, detail=str(exc)) from exc\n\n\n@router.get("/preferences")\nasync def get_preferences(user_id: str = Depends(get_current_user)) -> list[WidgetPreferenceSchema]:\n    prefs = await WidgetPreference.find(\n        WidgetPreference.user_id == PydanticObjectId(user_id),\n        WidgetPreference.app_id == "{app_id}",\n    ).to_list()\n    return [\n        WidgetPreferenceSchema(\n            id=str(pref.id),\n            user_id=str(pref.user_id),\n            widget_id=pref.widget_id,\n            app_id=pref.app_id,\n            enabled=pref.enabled,\n            position=pref.position,\n            config=pref.config,\n        )\n        for pref in prefs\n    ]\n\n\n@router.put("/preferences")\nasync def update_preferences(\n    updates: list[PreferenceUpdate],\n    user_id: str = Depends(get_current_user),\n) -> list[WidgetPreferenceSchema]:\n    for update in updates:\n        pref = await WidgetPreference.find_one(\n            WidgetPreference.user_id == PydanticObjectId(user_id),\n            WidgetPreference.app_id == "{app_id}",\n            WidgetPreference.widget_id == update.widget_id,\n        )\n        if pref:\n            if update.enabled is not None:\n                pref.enabled = update.enabled\n            if update.position is not None:\n                pref.position = update.position\n            if update.config is not None:\n                pref.config = update.config\n            await pref.save()\n    return await get_preferences(user_id)\n''',
    )


def scaffold_frontend(app_id: str, app_name: str) -> None:
    frontend_dir = FRONTEND_APPS / app_id
    manifest = {
        "id": app_id,
        "name": app_name,
        "widgets": [
            {
                "id": f"{app_id}.summary",
                "size": "medium",
            },
        ],
    }

    write_json(frontend_dir / "manifest.json", manifest)
    write(
        frontend_dir / "index.ts",
        f'''import manifest from "./manifest.json";\nimport AppView from "./AppView";\nimport DashboardWidget from "./DashboardWidget";\nimport type {{ FrontendAppDefinition, FrontendAppManifest }} from "../types";\n\nconst {app_id.replace("-", "_")}Manifest = manifest as FrontendAppManifest;\n\nexport const {app_name[0].lower() + app_name[1:]}App = {{\n  manifest: {app_id.replace("-", "_")}Manifest,\n  AppView,\n  DashboardWidget,\n}} satisfies FrontendAppDefinition;\n''',
    )
    write(frontend_dir / "AppView.tsx", 'export { default } from "./views/AppScreen";\n')
    write(frontend_dir / "DashboardWidget.tsx", 'export { default } from "./widgets/AppDashboardWidget";\n')
    write(
        frontend_dir / "api.ts",
        f'''import {{ api }} from "@/api/client";\n\nconst BASE = "/api/apps/{app_id}";\n\nexport interface ItemRead {{\n  id: string;\n  title: string;\n  description: string | null;\n  created_at: string;\n}}\n\nexport async function getItems(): Promise<ItemRead[]> {{\n  return api.get<ItemRead[]>(`${{BASE}}/{app_name.lower()}s`);\n}}\n''',
    )
    write(
        frontend_dir / "views" / "AppScreen.tsx",
        f'''export default function AppScreen() {{\n  return (\n    <div>\n      <h2 style={{{{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}}}>{app_name}</h2>\n      <p style={{{{ color: "var(--color-muted)", marginTop: "0.5rem" }}}}>\n        TODO: compose the {app_name} app page from components and features in this folder.\n      </p>\n    </div>\n  );\n}}\n''',
    )
    write(
        frontend_dir / "widgets" / "SummaryWidget.tsx",
        f'''import type {{ DashboardWidgetRendererProps }} from "../types";\n\nexport default function SummaryWidget({{ widget }}: DashboardWidgetRendererProps) {{\n  return (\n    <div>\n      <p className="section-label">{{widget.name}}</p>\n      <p style={{{{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}}}>\n        {{widget.description}}\n      </p>\n    </div>\n  );\n}}\n''',
    )
    write(
        frontend_dir / "widgets" / "AppDashboardWidget.tsx",
        f'''import type {{ ComponentType }} from "react";\nimport type {{ DashboardWidgetProps, DashboardWidgetRendererProps }} from "../types";\nimport SummaryWidget from "./SummaryWidget";\n\nconst WIDGET_COMPONENTS = {{\n  "{app_id}.summary": SummaryWidget,\n}} as const satisfies Record<string, ComponentType<DashboardWidgetRendererProps>>;\n\nexport default function AppDashboardWidget({{ widgetId, widget }}: DashboardWidgetProps) {{\n  const Component = WIDGET_COMPONENTS[widgetId as keyof typeof WIDGET_COMPONENTS];\n\n  if (Component) {{\n    return <Component widget={{widget}} />;\n  }}\n\n  return (\n    <div>\n      <p className="section-label">{{widget.name}}</p>\n      <p style={{{{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}}}>\n        {{widget.description}}\n      </p>\n    </div>\n  );\n}}\n''',
    )
    write(frontend_dir / "components" / ".gitkeep", "")
    write(frontend_dir / "features" / ".gitkeep", "")
    write(frontend_dir / "lib" / ".gitkeep", "")


def scaffold(app_id: str, create_frontend: bool, model_name: str) -> None:
    app_name = to_class_name(app_id)
    print(f"\n📦 Plugin: {app_id}")
    print(f"   Backend:  {(BACKEND_APPS / app_id).relative_to(ROOT)}/")
    if create_frontend:
        print(f"   Frontend: {(FRONTEND_APPS / app_id).relative_to(ROOT)}/")

    scaffold_backend(app_id, app_name, model_name)
    if create_frontend:
        scaffold_frontend(app_id, app_name)

    print("\n✅ Done! Next steps:")
    print(f"  1. Edit backend/apps/{app_id}/manifest.py to define real widgets and metadata")
    print(f"  2. Edit backend/apps/{app_id}/models.py, repository.py, service.py, tools.py, routes.py")
    print(f"  3. Edit backend/apps/{app_id}/prompts.py and agent.py")
    if create_frontend:
        print(f"  4. Fill out frontend/src/apps/{app_id}/views, widgets, features, components, and lib")
        print(f"  5. Add app-specific API helpers in frontend/src/apps/{app_id}/api.ts")
    print("  6. Run: python scripts/codegen.py")
    print("  7. Run: node scripts/validate-manifests.mjs")
    print("  8. Run: npm run build:frontend")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap a Shin SuperApp plugin.")
    parser.add_argument("app_id", help="Plugin ID in kebab-case, e.g. 'calendar'")
    parser.add_argument("--model", default=None, help="Primary backend model class name")
    parser.add_argument(
        "--no-frontend",
        dest="create_frontend",
        action="store_false",
        default=True,
        help="Skip frontend scaffolding",
    )
    args = parser.parse_args()

    try:
        app_id = validate_app_id(args.app_id)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    model_name = args.model or to_class_name(app_id)
    scaffold(app_id, args.create_frontend, model_name)


if __name__ == "__main__":
    main()

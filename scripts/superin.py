#!/usr/bin/env python3
"""Unified CLI for Superin developer workflows."""

from __future__ import annotations

import argparse
import asyncio
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

APP_ID_RE = re.compile(r"^[a-z][a-z0-9]*$")
RESERVED = {"auth", "catalog", "chat", "core", "shared", "apps"}
REQUIRES_LINHDZ = {"codegen", "db", "manifests", "plugin", "users"}


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def to_pascal_case(value: str) -> str:
    parts = [part for part in re.split(r"[\s_-]+", value) if part]
    return "".join(part[:1].upper() + part[1:] for part in parts)


def to_snake_case(value: str) -> str:
    normalized = value.replace("-", "_")
    snake = re.sub(r"(?<!^)(?=[A-Z])", "_", normalized).lower()
    return re.sub(r"_+", "_", snake).strip("_")


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
        env={**os.environ, "SUPERIN_SKIP_REEXEC": "1", "CONDA_PYTHON_EXE": "python"},
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


def sync_frontend_registry() -> None:
    """Compatibility no-op for frontend app auto-discovery.

    Frontend apps are discovered from file structure via Vite glob imports,
    so there is no handwritten registry file to update anymore.
    """
    print("[sync_frontend_registry] Auto-discovery is enabled via Vite glob import.")
    print("[sync_frontend_registry] No manual registry update needed.")
    print(f"[sync_frontend_registry] Apps are auto-discovered from: {FRONTEND_APPS.relative_to(ROOT)}")

    # List discovered apps for confirmation
    app_ids = sorted(
        entry.name
        for entry in FRONTEND_APPS.iterdir()
        if entry.is_dir() and (entry / "AppView.tsx").exists()
    )
    print(f"[sync_frontend_registry] Found {len(app_ids)} apps: {', '.join(app_ids)}")


def sync_frontend_app(app_id: str, *, force_widgets: bool = False) -> None:
    manifest = load_backend_manifest(app_id)
    app_name = manifest.name
    # Use sanitized pascal case for file names and component names
    # to avoid issues with special characters in manifest.name (e.g., "To-Do")
    sanitized_name = to_pascal_case(app_id)
    app_root = FRONTEND_APPS / app_id
    ensure_dir(app_root)

    write_file(app_root / "AppView.tsx", f'export {{ default }} from "./views/{sanitized_name}Screen";\n', overwrite=True)

    views_dir = app_root / "views"
    widgets_dir = app_root / "widgets"
    for directory in [app_root / "components", app_root / "features", views_dir, widgets_dir, app_root / "lib"]:
        ensure_dir(directory)
        gitkeep = directory / ".gitkeep"
        if not any(directory.iterdir()):
            write_file(gitkeep, "", overwrite=False)

    screen_path = views_dir / f"{sanitized_name}Screen.tsx"
    if not screen_path.exists():
        write_file(
            screen_path,
            (
                f"export default function {sanitized_name}Screen() {{\n"
                "  return (\n"
                "    <div>\n"
                f'      <h2 style={{{{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}}}>{app_name}</h2>\n'
                f'      <p style={{{{ color: "var(--color-foreground-muted)", marginTop: "0.5rem" }}}}>TODO: compose the {app_name} app page from features and components.</p>\n'
                "    </div>\n"
                "  );\n"
                "}\n"
            ),
            overwrite=False,
        )

    for widget in manifest.widgets:
        component_name = widget_component_name(widget.id)
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
                    '      <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", margin: "0.25rem 0 0" }}>\n'
                    "        {widget.description}\n"
                    "      </p>\n"
                    "    </div>\n"
                    "  );\n"
                    "}\n"
                ),
                overwrite=True,
            )
    sync_frontend_registry()
    run_codegen()


def validate_manifests() -> None:
    backend_manifests = load_backend_manifests()
    backend_by_id = {manifest.id: manifest for manifest in backend_manifests}

    frontend_app_dirs = sorted(
        entry.name
        for entry in FRONTEND_APPS.iterdir()
        if entry.is_dir() and (entry / "AppView.tsx").exists()
    )
    frontend_by_id = {app_id: FRONTEND_APPS / app_id for app_id in frontend_app_dirs}

    if sorted(backend_by_id) != sorted(frontend_by_id):
        fail(
            "manifest validation failed: app ids differ.\n"
            f"frontend: {', '.join(sorted(frontend_by_id))}\n"
            f"backend: {', '.join(sorted(backend_by_id))}",
        )

    for app_id, app_root in frontend_by_id.items():
        for required_file in ["AppView.tsx", "DashboardWidget.tsx"]:
            if not (app_root / required_file).exists():
                fail(f"manifest validation failed: missing frontend app file: {(app_root / required_file).relative_to(ROOT)}")
        for required_dir in ["components", "features", "views", "widgets", "lib"]:
            if not (app_root / required_dir).exists():
                fail(f"manifest validation failed: missing frontend app dir: {(app_root / required_dir).relative_to(ROOT)}")

        backend_manifest = backend_by_id[app_id]
        frontend_widgets = {widget.id for widget in backend_manifest.widgets}
        backend_widgets = {widget.id: widget.size for widget in backend_manifest.widgets}

        discovered_widget_files = {
            path.name
            for path in (app_root / "widgets").glob("*.tsx")
            if path.name != "Widget.tsx"
        }
        expected_widget_files = {widget_file_name(widget_id) for widget_id in frontend_widgets}

        if discovered_widget_files != expected_widget_files:
            fail(
                f"manifest validation failed: widget files differ for {app_id}.\n"
                f"frontend: {', '.join(sorted(discovered_widget_files))}\n"
                f"backend: {', '.join(sorted(expected_widget_files))}",
            )

        for widget_id, backend_size in backend_widgets.items():
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
            f"app_id '{app_id}' is invalid. Use lowercase letters and digits only, e.g. 'finance' or 'health2'.",
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
    entity_name = model_name
    entity_snake = to_snake_case(model_name)
    entity_plural_snake = f"{entity_snake}s"
    schema_prefix = app_name if model_name == app_name else f"{app_name}{model_name}"
    manifest_var = f"{app_id}_manifest"
    create_request_schema = f"{schema_prefix}CreateRequest"
    read_schema = f"{schema_prefix}Read"
    action_response_schema = f"{schema_prefix}ActionResponse"
    list_tool_name = f"{app_id}_list_{entity_plural_snake}"
    create_tool_name = f"{app_id}_create_{entity_snake}"
    delete_tool_name = f"{app_id}_delete_{entity_snake}"
    backend_dir = BACKEND_APPS / app_id
    collection_name = f"{app_id}_{entity_plural_snake}"
    list_path = f"/{entity_plural_snake}"
    detail_path = f"/{entity_plural_snake}/{{item_id}}"

    write_file(
        backend_dir / "__init__.py",
        f'''"""Auto-register the {app_name} plugin."""

from core.registry import register_plugin

from .agent import {app_name}Agent
from .manifest import {manifest_var}
from .models import {entity_name}
from .routes import router

register_plugin(
    manifest={manifest_var},
    agent={app_name}Agent(),
    router=router,
    models=[{entity_name}],
)
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "manifest.py",
        f'''"""Manifest for the {app_name} plugin."""

from shared.schemas import AppManifestSchema, WidgetManifestSchema

summary_widget = WidgetManifestSchema(
    id="{app_id}.summary",
    name="{app_name} Summary",
    description="Shows a quick summary for the {app_name} app.",
    icon="Box",
    size="standard",
)

{manifest_var} = AppManifestSchema(
    id="{app_id}",
    name="{app_name}",
    version="1.0.0",
    description="TODO: describe what the {app_name} app does.",
    icon="Box",
    color="oklch(0.65 0.21 280)",
    widgets=[summary_widget],
    agent_description="Handles {app_name.lower()} questions and actions.",
    tools=["{list_tool_name}", "{create_tool_name}", "{delete_tool_name}"],
    models=["{entity_name}"],
    category="other",
    tags=["{app_id}"],
    author="Superin Team",
)
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "models.py",
        f'''"""Beanie models for the {app_name} plugin."""

from __future__ import annotations

from datetime import datetime

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

from core.models import utc_now


class {entity_name}(Document):
    user_id: PydanticObjectId
    title: str
    description: str | None = None
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "{collection_name}"
        indexes = [
            IndexModel([('user_id', 1)], name="{collection_name}_user_id"),
        ]
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "repository.py",
        f'''"""Repository layer for the {app_name} plugin."""

from __future__ import annotations

from beanie import PydanticObjectId

from .models import {entity_name}


class {entity_name}Repository:
    async def list_for_user(self, user_id: str, limit: int = 50) -> list[{entity_name}]:
        return await {entity_name}.find(
            {entity_name}.user_id == PydanticObjectId(user_id),
        ).sort("-created_at").limit(limit).to_list()

    async def find_by_id(self, item_id: str, user_id: str) -> {entity_name} | None:
        return await {entity_name}.find_one(
            {entity_name}.id == PydanticObjectId(item_id),
            {entity_name}.user_id == PydanticObjectId(user_id),
        )

    async def create(self, user_id: str, title: str, description: str | None = None) -> {entity_name}:
        item = {entity_name}(
            user_id=PydanticObjectId(user_id),
            title=title,
            description=description,
        )
        await item.insert()
        return item

    async def delete(self, item: {entity_name}) -> None:
        await item.delete()

    async def delete_all_by_user(self, user_id: str) -> int:
        collection = {entity_name}.get_pymongo_collection()
        result = await collection.delete_many({{"user_id": PydanticObjectId(user_id)}})
        return result.deleted_count


{entity_snake}_repository = {entity_name}Repository()
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "schemas.py",
        f'''"""Request/response schemas for the {app_name} plugin."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class {create_request_schema}(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None


class {read_schema}(BaseModel):
    id: str
    title: str
    description: str | None = None
    created_at: datetime


class {action_response_schema}(BaseModel):
    success: bool
    id: str
    message: str | None = None
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "service.py",
        f'''"""Service layer for the {app_name} plugin."""

from __future__ import annotations

from .models import {entity_name}
from .repository import {entity_name}Repository, {entity_snake}_repository
from .schemas import {action_response_schema}, {read_schema}


class {entity_name}Service:
    def __init__(self) -> None:
        self.repo: {entity_name}Repository = {entity_snake}_repository

    async def list_items(self, user_id: str, limit: int = 50) -> list[{read_schema}]:
        items = await self.repo.list_for_user(user_id, limit)
        return [_to_read(item) for item in items]

    async def create_item(self, user_id: str, title: str, description: str | None = None) -> {read_schema}:
        if not title.strip():
            raise ValueError("Title cannot be empty")
        item = await self.repo.create(user_id, title.strip(), description)
        return _to_read(item)

    async def delete_item(self, item_id: str, user_id: str) -> {action_response_schema}:
        item = await self.repo.find_by_id(item_id, user_id)
        if not item:
            raise ValueError("{entity_name} not found")
        await self.repo.delete(item)
        return {action_response_schema}(success=True, id=item_id)

    async def on_install(self, user_id: str) -> None:
        existing_items = await self.repo.list_for_user(user_id, limit=1)
        if existing_items:
            return
        await self.repo.create(
            user_id,
            "Welcome to {app_name}!",
            "Replace this seeded item with your real default data.",
        )

    async def on_uninstall(self, user_id: str) -> None:
        await self.repo.delete_all_by_user(user_id)


def _to_read(item: {entity_name}) -> {read_schema}:
    return {read_schema}(
        id=str(item.id),
        title=item.title,
        description=item.description,
        created_at=item.created_at,
    )


{entity_snake}_service = {entity_name}Service()
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "tools.py",
        f'''"""LangGraph tools for the {app_name} plugin."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call

from .service import {entity_snake}_service


@tool("{list_tool_name}")
async def {list_tool_name}(limit: int = 20) -> dict[str, Any]:
    """List {app_name.lower()} items for the current user."""

    async def operation() -> list[dict[str, Any]]:
        user_id = get_user_context()
        items = await {entity_snake}_service.list_items(user_id, limit)
        return [item.model_dump() for item in items]

    return await safe_tool_call(operation, action="listing {entity_plural_snake}")


@tool("{create_tool_name}")
async def {create_tool_name}(title: str, description: str | None = None) -> dict[str, Any]:
    """Create a new {app_name.lower()} item."""

    async def operation() -> dict[str, Any]:
        user_id = get_user_context()
        item = await {entity_snake}_service.create_item(user_id, title, description)
        return item.model_dump()

    return await safe_tool_call(operation, action="creating a {entity_snake}")


@tool("{delete_tool_name}")
async def {delete_tool_name}(item_id: str) -> dict[str, Any]:
    """Delete a {app_name.lower()} item by id."""

    async def operation() -> dict[str, Any]:
        user_id = get_user_context()
        result = await {entity_snake}_service.delete_item(item_id, user_id)
        return result.model_dump()

    return await safe_tool_call(operation, action="deleting a {entity_snake}")
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "prompts.py",
        f'''"""Prompt helpers for the {app_name} child agent."""


def get_{app_id}_prompt() -> str:
    return """You are the {app_name} app assistant.
Help the user with {app_name.lower()}-related tasks.
Use tools when needed and keep responses concise.
Ask for confirmation before destructive deletes."""
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "agent.py",
        f'''"""Child LangGraph agent for the {app_name} plugin."""

from langchain_core.tools import BaseTool

from core.agents.base_app import BaseAppAgent
from shared.agent_context import set_user_context

from .prompts import get_{app_id}_prompt
from .service import {entity_snake}_service
from .tools import {create_tool_name}, {delete_tool_name}, {list_tool_name}


class {app_name}Agent(BaseAppAgent):
    app_id = "{app_id}"

    def tools(self) -> list[BaseTool]:
        return [{list_tool_name}, {create_tool_name}, {delete_tool_name}]

    def build_prompt(self) -> str:
        return get_{app_id}_prompt()

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await {entity_snake}_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await {entity_snake}_service.on_uninstall(user_id)
''',
        overwrite=False,
    )
    write_file(
        backend_dir / "routes.py",
        f'''"""FastAPI routes for the {app_name} plugin."""

from __future__ import annotations

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from core.auth.dependencies import get_current_user
from core.models import WidgetPreference
from shared.preference_utils import preference_to_schema, update_multiple_preferences
from shared.schemas import PreferenceUpdate, WidgetManifestSchema, WidgetPreferenceSchema

from .manifest import {manifest_var}
from .schemas import {action_response_schema}, {create_request_schema}, {read_schema}
from .service import {entity_snake}_service

router = APIRouter()


@router.get("/widgets", response_model=list[WidgetManifestSchema])
async def list_widgets() -> list[WidgetManifestSchema]:
    return {manifest_var}.widgets


@router.get("{list_path}", response_model=list[{read_schema}])
async def list_items(
    user_id: str = Depends(get_current_user),
    limit: int = Query(20, le=100),
) -> list[{read_schema}]:
    return await {entity_snake}_service.list_items(user_id, limit)


@router.post("{list_path}", response_model={read_schema})
async def create_item(
    request: {create_request_schema},
    user_id: str = Depends(get_current_user),
) -> {read_schema}:
    try:
        return await {entity_snake}_service.create_item(user_id, request.title, request.description)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("{detail_path}", response_model={action_response_schema})
async def delete_item(item_id: str, user_id: str = Depends(get_current_user)) -> {action_response_schema}:
    try:
        return await {entity_snake}_service.delete_item(item_id, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/preferences", response_model=list[WidgetPreferenceSchema])
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "{app_id}",
    ).to_list()
    return [preference_to_schema(pref) for pref in prefs]


@router.put("/preferences", response_model=list[WidgetPreferenceSchema])
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    await update_multiple_preferences(user_id, updates, "{app_id}")
    return await get_preferences(user_id)
''',
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


def _db_connection() -> tuple[object, str]:
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))

    from pymongo import AsyncMongoClient

    from core.config import settings  # type: ignore

    return AsyncMongoClient(settings.mongodb_uri), settings.mongodb_database


async def check_core_indexes() -> None:
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))

    from core.utils.index_contract import validate_index_contract  # type: ignore

    client, database_name = _db_connection()
    try:
        await validate_index_contract(client[database_name])
    finally:
        await client.close()


async def initialize_clean_database() -> None:
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))

    from beanie import init_beanie

    from core.discovery import discover_apps  # type: ignore
    from core.models import (  # type: ignore
        AppCategory,
        TokenBlacklist,
        User,
        UserAppInstallation,
        WidgetDataConfig,
        WidgetPreference,
    )
    from core.registry import get_plugin_models  # type: ignore
    from core.subscriptions.model import Subscription, SubscriptionWebhookEvent  # type: ignore

    client, database_name = _db_connection()
    try:
        database = client[database_name]
        discover_apps()
        await init_beanie(
            database=database,
            document_models=[
                User,
                UserAppInstallation,
                AppCategory,
                WidgetPreference,
                WidgetDataConfig,
                TokenBlacklist,
                Subscription,
                SubscriptionWebhookEvent,
                *get_plugin_models(),
            ],
        )
    finally:
        await client.close()


async def reset_database() -> None:
    from pymongo.errors import OperationFailure

    client, database_name = _db_connection()
    try:
        try:
            await client.drop_database(database_name)
            print(f"dropped database `{database_name}`")
        except OperationFailure as exc:
            if exc.code != 8000:
                raise

            database = client[database_name]
            collection_names = await database.list_collection_names()
            for collection_name in collection_names:
                await database.drop_collection(collection_name)
            print(
                "dropDatabase permission unavailable; "
                f"dropped {len(collection_names)} collection(s) in `{database_name}` instead"
            )
    finally:
        await client.close()
    await initialize_clean_database()
    print(f"reinitialized database `{database_name}` from current Beanie models")


async def promote_user_to_admin(email: str) -> None:
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))

    from shared.enums import UserRole  # type: ignore

    normalized_email = email.strip()
    if not normalized_email:
        fail("email is required")

    client, database_name = _db_connection()
    try:
        users = client[database_name]["users"]
        case_insensitive_query = {
            "email": {"$regex": f"^{re.escape(normalized_email)}$", "$options": "i"},
        }
        matches = await users.count_documents(case_insensitive_query)
        if matches == 0:
            fail(f"user with email '{normalized_email}' not found")
        if matches > 1:
            fail(
                "multiple users matched the email ignoring case; "
                "please normalize duplicated emails before promoting admin",
            )

        user = await users.find_one(case_insensitive_query, {"_id": 1, "email": 1, "role": 1})
        if user is None:
            fail(f"user with email '{normalized_email}' not found")

        current_role = user.get("role")
        if current_role == UserRole.ADMIN.value:
            print(f"user '{user['email']}' is already admin")
            return

        await users.update_one(
            {"_id": user["_id"]},
            {"$set": {"role": UserRole.ADMIN.value}},
        )
        print(f"promoted '{user['email']}' to admin")
    finally:
        await client.close()


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

    db = subparsers.add_parser("db", help="Database workflows")
    db_sub = db.add_subparsers(dest="db_command", required=True)
    db_sub.add_parser("check-indexes", help="Validate core Mongo index contract")
    db_reset = db_sub.add_parser("reset", help="Drop the configured Mongo database and recreate indexes from models")
    db_reset.add_argument("--yes", action="store_true", help="Confirm destructive reset")

    users = subparsers.add_parser("users", help="User account workflows")
    users_sub = users.add_subparsers(dest="users_command", required=True)
    users_promote_admin = users_sub.add_parser(
        "promote-admin",
        help="Promote a user to admin by email",
    )
    users_promote_admin.add_argument("--email", required=True, help="User email to promote")

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

    if args.command == "db" and args.db_command == "check-indexes":
        asyncio.run(check_core_indexes())
        print("core index contract is valid")
        return

    if args.command == "db" and args.db_command == "reset":
        if not args.yes:
            fail("db reset is destructive. Re-run with --yes to drop the configured Mongo database.")
        asyncio.run(reset_database())
        return

    if args.command == "users" and args.users_command == "promote-admin":
        asyncio.run(promote_user_to_admin(args.email))
        return

    if args.command == "dev":
        run_dev(args.frontend_delay)
        return


if __name__ == "__main__":
    main()

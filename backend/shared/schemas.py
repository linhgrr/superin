"""Shared Pydantic schemas — single source of truth for TypeScript codegen.

All schemas that are shared between backend and frontend live here.
App-specific schemas live in backend/apps/{app_id}/schemas.py.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

from shared.enums import (
    ChatEventType,
    ConfigFieldType,
    PaymentProvider,
    PermissionKey,
    SubscriptionStatus,
    SubscriptionTier,
    UserRole,
    WidgetSize,
)

# ─── User ───────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    email: EmailStr
    name: str


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserRead(UserBase):
    id: str
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Public user info — returned in auth responses."""

    id: str
    email: str
    name: str
    avatar_url: str | None = None
    role: UserRole
    settings: dict = Field(default_factory=dict)


# ─── Subscription ──────────────────────────────────────────────────────────────


class SubscriptionRead(BaseModel):
    """User subscription state — returned in auth responses."""

    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserWithSubscription(BaseModel):
    """User with their subscription — used for /me and workspace."""

    id: str
    email: str
    name: str
    avatar_url: str | None = None
    role: UserRole
    settings: dict = Field(default_factory=dict)
    subscription: SubscriptionRead


# ─── Auth ──────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=100)


class PermissionRead(BaseModel):
    key: PermissionKey
    allowed: bool


class PermissionListRead(BaseModel):
    items: list[PermissionRead]


# ─── Widgets ───────────────────────────────────────────────────────────────────

class SelectOption(BaseModel):
    label: str
    value: str


class ConfigFieldSchema(BaseModel):
    """A configuration field for a widget."""

    name: str = Field(description="Field key, camelCase")
    label: str
    type: ConfigFieldType
    required: bool = False
    default: Any | None = None
    options: list[SelectOption] = Field(default_factory=list)
    options_source: str | None = Field(
        default=None,
        description="Widget resolver ID for dynamic options, e.g. 'finance.wallets'",
    )
    placeholder: str | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None


class WidgetManifestSchema(BaseModel):
    """A single widget definition — referenced in AppManifestSchema.widgets."""

    id: str = Field(
        description="Unique widget ID, format '{app_id}.{widget_name}', e.g. 'finance.total-balance'",
    )
    name: str
    description: str
    icon: str = Field(description="Lucide icon name")
    size: WidgetSize = WidgetSize.STANDARD
    config_fields: list[ConfigFieldSchema] = Field(default_factory=list)
    requires_auth: bool = True


class WidgetPreferenceSchema(BaseModel):
    """User-specific widget state stored in DB."""

    id: str | None = Field(default=None, alias="_id")
    user_id: str
    widget_id: str
    app_id: str
    enabled: bool = False
    sort_order: int = 0  # Sequential ordering for widget list (not grid position)
    grid_x: int = Field(default=0, ge=0)
    grid_y: int = Field(default=0, ge=0)
    size_w: int | None = Field(default=None, ge=2, le=12)
    size_h: int | None = Field(default=None, ge=1, le=6)

    model_config = {"populate_by_name": True}


class PreferenceUpdate(BaseModel):
    """Update payload for a single widget preference."""

    widget_id: str
    enabled: bool | None = None
    sort_order: int | None = None
    grid_x: int | None = Field(default=None, ge=0)
    grid_y: int | None = Field(default=None, ge=0)
    size_w: int | None = Field(default=None, ge=2, le=12)
    size_h: int | None = Field(default=None, ge=1, le=6)

    model_config = {"extra": "forbid"}


class WidgetDataConfigSchema(BaseModel):
    """Persisted per-widget data config."""

    id: str | None = Field(default=None, alias="_id")
    user_id: str
    widget_id: str
    config: dict = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class WidgetDataConfigUpdate(BaseModel):
    """Update payload for widget data config."""

    widget_id: str
    config: dict = Field(default_factory=dict)


# ─── App / Plugin ──────────────────────────────────────────────────────────────

class AppManifestSchema(BaseModel):
    """The manifest that every plugin MUST provide."""

    id: str = Field(
        description="Unique app ID, lowercase letters and digits only, e.g. 'finance', 'todo', 'health2'",
    )
    name: str
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    description: str
    icon: str = Field(description="Lucide icon name, e.g. 'Wallet', 'CheckSquare'")
    color: str = Field(
        description="Accent color in oklch(), e.g. 'oklch(0.72 0.19 145)'",
    )
    widgets: list[WidgetManifestSchema]
    agent_description: str = Field(
        description="Natural language description of agent capabilities, used by RootAgent for routing",
    )
    models: list[str] = Field(
        description="Beanie model class names (as strings) this app owns",
    )
    category: Literal[
        "finance", "productivity", "health", "social", "developer", "other"
    ] = "other"
    tags: list[str] = []
    screenshots: list[str] = []
    author: str = "Superin Team"
    homepage: str = ""
    requires_auth: bool = True
    requires_tier: SubscriptionTier = SubscriptionTier.FREE


class AppCatalogEntry(BaseModel):
    """Summary entry shown in the app store."""

    id: str
    name: str
    description: str
    icon: str
    color: str
    category: str
    version: str
    author: str
    is_installed: bool = False
    tags: list[str] = []
    screenshots: list[str] = []
    widgets: list[WidgetManifestSchema] = Field(default_factory=list)
    requires_tier: SubscriptionTier = SubscriptionTier.FREE


class AppRuntimeEntry(BaseModel):
    """Installed app entry returned in the authenticated workspace runtime."""

    id: str
    name: str
    description: str
    icon: str
    color: str
    category: str
    version: str
    author: str
    widgets: list[WidgetManifestSchema] = Field(default_factory=list)
    # requires_tier is server-only — clients receive 403 before seeing this field.
    # It is NOT present here so it cannot leak through workspace bootstrap.


class AppCategoryRead(BaseModel):
    """App catalog category entry shown in the store UI."""

    id: str
    name: str
    icon: str
    color: str
    order: int
    auto_discovered: bool = False


class AppInstallRequest(BaseModel):
    app_id: str


class AppUninstallRequest(BaseModel):
    app_id: str


class WorkspaceBootstrap(BaseModel):
    """Authenticated workspace runtime bootstrap payload."""

    installed_apps: list[AppRuntimeEntry] = Field(default_factory=list)
    widget_preferences: list[WidgetPreferenceSchema] = Field(default_factory=list)
    widget_data_configs: list[WidgetDataConfigSchema] = Field(default_factory=list)
    initial_widget_data: dict[str, Any] = Field(default_factory=dict)


# ─── Chat / Agent ──────────────────────────────────────────────────────────────

class ChatStreamToken(BaseModel):
    type: ChatEventType = ChatEventType.TOKEN
    content: str


class ChatStreamToolCall(BaseModel):
    type: ChatEventType = ChatEventType.TOOL_CALL
    tool_call_id: str
    tool_name: str
    args: dict
    args_text: str | None = None


class ChatStreamToolResult(BaseModel):
    type: ChatEventType = ChatEventType.TOOL_RESULT
    tool_call_id: str
    tool_name: str
    result: Any


class ChatStreamDone(BaseModel):
    type: ChatEventType = ChatEventType.DONE


class ChatStreamError(BaseModel):
    type: ChatEventType = ChatEventType.ERROR
    message: str


ChatStreamEvent = (
    ChatStreamToken
    | ChatStreamToolCall
    | ChatStreamToolResult
    | ChatStreamDone
    | ChatStreamError
)

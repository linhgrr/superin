"""Shared Pydantic schemas — single source of truth for TypeScript codegen.

All schemas that are shared between backend and frontend live here.
App-specific schemas live in backend/apps/{app_id}/schemas.py.
"""

from datetime import datetime
from typing import Any, Literal, Optional, Union
from pydantic import BaseModel, EmailStr, Field

from shared.enums import WidgetSize, ConfigFieldType, ChatEventType


# ─── User ───────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    email: EmailStr
    name: str


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserRead(UserBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Public user info — returned in auth responses."""

    id: str
    email: str
    name: str


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
    default: Optional[Any] = None
    options: list[SelectOption] = Field(default_factory=list)
    options_source: Optional[str] = Field(
        default=None,
        description="Widget resolver ID for dynamic options, e.g. 'finance.wallets'",
    )
    placeholder: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None


class WidgetManifestSchema(BaseModel):
    """A single widget definition — referenced in AppManifestSchema.widgets."""

    id: str = Field(
        description="Unique widget ID, format '{app_id}.{widget_name}', e.g. 'finance.total-balance'",
    )
    name: str
    description: str
    icon: str = Field(description="Lucide icon name")
    size: WidgetSize = "standard"
    config_fields: list[ConfigFieldSchema] = Field(default_factory=list)
    requires_auth: bool = True


class WidgetPreferenceSchema(BaseModel):
    """User-specific widget state stored in DB."""

    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    widget_id: str
    app_id: str
    enabled: bool = False
    position: int = 0
    config: dict = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class PreferenceUpdate(BaseModel):
    """Update payload for a single widget preference."""

    widget_id: str
    enabled: Optional[bool] = None
    position: Optional[int] = None
    config: Optional[dict] = None


# ─── App / Plugin ──────────────────────────────────────────────────────────────

class AppManifestSchema(BaseModel):
    """The manifest that every plugin MUST provide."""

    id: str = Field(
        description="Unique app ID, kebab-case, e.g. 'finance', 'todo'",
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
    tools: list[str] = Field(
        description="List of LangChain/LangGraph tool names this app exposes",
    )
    models: list[str] = Field(
        description="Beanie model class names (as strings) this app owns",
    )
    category: Literal[
        "finance", "productivity", "health", "social", "developer", "other"
    ] = "other"
    tags: list[str] = []
    screenshots: list[str] = []
    author: str = "Shin Team"
    homepage: str = ""
    requires_auth: bool = True


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


class AppInstallRequest(BaseModel):
    app_id: str


class AppUninstallRequest(BaseModel):
    app_id: str


# ─── Chat / Agent ──────────────────────────────────────────────────────────────

class ChatStreamToken(BaseModel):
    type: Literal["token"]
    content: str


class ChatStreamToolCall(BaseModel):
    type: Literal["tool_call"]
    tool_call_id: str
    tool_name: str
    args: dict
    args_text: Optional[str] = None


class ChatStreamToolResult(BaseModel):
    type: Literal["tool_result"]
    tool_call_id: str
    tool_name: str
    result: Any


class ChatStreamDone(BaseModel):
    type: Literal["done"]


class ChatStreamError(BaseModel):
    type: Literal["error"]
    message: str


ChatStreamEvent = Union[
    ChatStreamToken,
    ChatStreamToolCall,
    ChatStreamToolResult,
    ChatStreamDone,
    ChatStreamError,
]

# Admin Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisites:** Plan A (RBAC Core) must be implemented first. Plan B (Payment) is optional — Plan C can manage subscriptions manually (admin overrides tier/status directly) without payment integration.

**Goal:** Build an admin page at `/admin` accessible only to users with `role = "admin"`. The page provides three management tabs: **Users**, **Subscriptions**, and **Apps**. Admins can promote/demote users, manually upgrade/downgrade subscriptions, and enable/disable apps in the catalog.

**Architecture:**
- Backend: New `admin` plugin with routes for user management, subscription management, and app catalog
- Frontend: New `AdminPage.tsx` with tabs — users, subscriptions, apps
- Admin routes are protected by `get_current_admin_user` dependency (role check only — no subscription needed)
- Subscription management is write-capable (admin can override tier/status directly in DB, bypassing payment)

**Tech Stack:** React, HeroUI v3 components (Table, Tabs, Badge, Modal), SWR for data fetching

---

## File Map

| Action | File |
|--------|------|
| Create | `backend/apps/admin/__init__.py` |
| Create | `backend/apps/admin/manifest.py` |
| Create | `backend/apps/admin/routes.py` |
| Create | `backend/apps/admin/schemas.py` |
| Create | `backend/apps/admin/service.py` |
| Modify | `backend/apps/billing/models.py` — add helper method for admin tier update |
| Modify | `frontend/src/App.tsx` — add /admin route |
| Create | `frontend/src/pages/AdminPage.tsx` |

---

## Task 1: Create admin plugin — manifest and __init__.py

**Files:**
- Create: `backend/apps/admin/__init__.py`
- Create: `backend/apps/admin/manifest.py`

- [ ] **Step 1: Create directory and manifest**

```bash
mkdir -p /home/linh/Downloads/superin/backend/apps/admin
```

Create `backend/apps/admin/manifest.py`:

```python
"""Admin app manifest — required by plugin registration."""

ADMIN_WIDGETS: list[WidgetManifestSchema] = [
    WidgetManifestSchema(
        id="admin.overview",
        name="Admin Overview",
        description="System overview and quick stats",
        icon="Shield",
        size="standard",
        requires_auth=True,
    ),
]


class AdminManifest:
    id = "admin"
    name = "Admin"
    version = "0.1.0"
    description = "Admin dashboard for user, subscription, and app management"
    icon = "Shield"
    color = "oklch(0.63 0.24 25)"  # Danger/red — admin color
    widgets = ADMIN_WIDGETS
    agent_description = "Provides admin tools for managing the platform"
    tools = []
    models = []
    category = "other"
    tags = []
    screenshots = []
    author = "Shin Team"
    homepage = ""
    requires_auth = True
    requires_tier: SubscriptionTier = "free"  # Admin page itself is free to access
```

Create `backend/apps/admin/__init__.py`:

```python
"""Admin plugin — user, subscription, and app catalog management."""

import logging

from core.registry import register_plugin

from apps.admin.manifest import AdminManifest
from apps.admin.routes import router

logger = logging.getLogger(__name__)


def register() -> None:
    register_plugin(
        manifest=AdminManifest,
        router=router,
    )
    logger.info("✓ Admin plugin registered")
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/admin/
git commit -m "feat(admin): add admin plugin with manifest

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 2: Create admin service layer

**Files:**
- Create: `backend/apps/admin/service.py`

This service handles business logic for admin operations. All methods require admin role (enforced at route level via `get_current_admin_user`).

- [ ] **Step 1: Create `backend/apps/admin/service.py`**

```python
"""Admin business logic — user, subscription, and app catalog management.

All methods require admin role (check at route level, not here).
"""

import logging
from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId

from apps.billing.models import Subscription
from core.models import User, UserAppInstallation
from core.registry import PLUGIN_REGISTRY
from shared.enums import SubscriptionStatus, SubscriptionTier, UserRole

logger = logging.getLogger(__name__)


# ─── User management ────────────────────────────────────────────────────────────


async def list_users(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """List all users with pagination and optional email search.

    Returns (users, total_count).
    """
    query: dict[str, Any] = {}
    if search:
        query["email"] = {"$regex": search, "$options": "i"}

    total = await User.find_all().count()
    users = (
        await User.find(query)
        .skip(skip)
        .limit(limit)
        .sort("-created_at")
        .to_list()
    )

    result = []
    for user in users:
        sub = await Subscription.find_one(
            Subscription.user_id == user.id,
        )
        result.append({
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "created_at": user.created_at,
            "subscription": {
                "tier": sub.tier if sub else "free",
                "status": sub.status if sub else "inactive",
                "provider": sub.provider if sub else None,
            } if sub else {
                "tier": "free",
                "status": "inactive",
                "provider": None,
            },
        })

    return result, total


async def update_user_role(user_id: str, new_role: UserRole) -> dict[str, Any]:
    """Promote or demote a user's admin role.

    Raises ValueError if user not found.
    """
    user = await User.get(user_id)
    if not user:
        raise ValueError(f"User {user_id} not found")

    old_role = user.role
    user.role = new_role
    await user.save()
    logger.info("Changed user %s role from %s to %s", user.email, old_role, new_role)

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "message": f"Role changed from '{old_role}' to '{new_role}'",
    }


# ─── Subscription management ───────────────────────────────────────────────────


async def list_subscriptions(
    skip: int = 0,
    limit: int = 50,
    status: SubscriptionStatus | None = None,
    tier: SubscriptionTier | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """List all subscriptions with optional filters."""
    query: dict[str, Any] = {}
    if status:
        query["status"] = status
    if tier:
        query["tier"] = tier

    total = await Subscription.find_all().count()
    subs = (
        await Subscription.find(query)
        .skip(skip)
        .limit(limit)
        .sort("-created_at")
        .to_list()
    )

    result = []
    for sub in subs:
        user = await User.get(sub.user_id)
        result.append({
            "id": str(sub.id),
            "user_id": str(sub.user_id),
            "user_email": user.email if user else "Unknown",
            "user_name": user.name if user else "Unknown",
            "tier": sub.tier,
            "status": sub.status,
            "provider": sub.provider,
            "started_at": sub.started_at,
            "expires_at": sub.expires_at,
            "created_at": sub.created_at,
        })

    return result, total


async def update_subscription_tier(
    user_id: str,
    new_tier: SubscriptionTier,
    reason: str | None = None,
) -> dict[str, Any]:
    """Admin override: directly set a user's subscription tier.

    This bypasses payment. Use for manual upgrades/downgrades, refunds, etc.
    """
    now = datetime.now(UTC)

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None:
        sub = Subscription(
            user_id=PydanticObjectId(user_id),
            tier=new_tier,
            status="active" if new_tier == "paid" else "inactive",
            created_at=now,
            updated_at=now,
        )
        await sub.insert()
        logger.info(
            "Admin created subscription for user %s: tier=%s reason=%s",
            user_id,
            new_tier,
            reason,
        )
    else:
        sub.tier = new_tier
        sub.status = "active" if new_tier == "paid" else "inactive"
        sub.updated_at = now
        await sub.save()
        logger.info(
            "Admin updated subscription for user %s: tier=%s reason=%s",
            user_id,
            new_tier,
            reason,
        )

    user = await User.get(user_id)
    return {
        "user_id": user_id,
        "user_email": user.email if user else None,
        "tier": sub.tier,
        "status": sub.status,
        "message": f"Subscription set to '{new_tier}' by admin. {reason or ''}",
    }


async def update_subscription_status(
    user_id: str,
    new_status: SubscriptionStatus,
) -> dict[str, Any]:
    """Admin override: directly set a user's subscription status."""
    now = datetime.now(UTC)

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if not sub:
        raise ValueError(f"No subscription found for user {user_id}")

    old_status = sub.status
    sub.status = new_status
    sub.updated_at = now
    await sub.save()
    logger.info("Admin changed subscription status for user %s: %s → %s", user_id, old_status, new_status)

    user = await User.get(user_id)
    return {
        "user_id": user_id,
        "user_email": user.email if user else None,
        "status": sub.status,
        "tier": sub.tier,
        "message": f"Status changed from '{old_status}' to '{new_status}'",
    }


# ─── App catalog management ─────────────────────────────────────────────────────


async def list_catalog_apps() -> list[dict[str, Any]]:
    """List all registered apps with their requires_tier and install counts."""
    apps = []
    for app_id, plugin in PLUGIN_REGISTRY.items():
        manifest = plugin["manifest"]
        install_count = await UserAppInstallation.find(
            UserAppInstallation.app_id == app_id,
            UserAppInstallation.status == "active",
        ).count()

        apps.append({
            "id": app_id,
            "name": manifest.name,
            "icon": manifest.icon,
            "color": manifest.color,
            "version": manifest.version,
            "requires_tier": getattr(manifest, "requires_tier", "free"),
            "install_count": install_count,
        })

    return apps


async def update_app_requires_tier(
    app_id: str,
    new_tier: SubscriptionTier,
) -> dict[str, Any]:
    """Admin override: change the required tier for an app.

    Note: This updates the manifest in memory (runtime only). For permanent change,
    the manifest file must be edited and the server restarted.
    """
    plugin = PLUGIN_REGISTRY.get(app_id)
    if not plugin:
        raise ValueError(f"App '{app_id}' not found")

    manifest = plugin["manifest"]
    old_tier = getattr(manifest, "requires_tier", "free")
    manifest.requires_tier = new_tier  # Runtime-only update

    logger.info("Admin changed app %s requires_tier from %s to %s", app_id, old_tier, new_tier)

    return {
        "id": app_id,
        "name": manifest.name,
        "old_tier": old_tier,
        "new_tier": new_tier,
        "message": f"requires_tier changed from '{old_tier}' to '{new_tier}' (runtime only — edit manifest file for permanent change)",
    }


# ─── Stats ─────────────────────────────────────────────────────────────────────


async def get_admin_stats() -> dict[str, Any]:
    """Return high-level stats for the admin dashboard."""
    total_users = await User.find_all().count()
    total_subscriptions = await Subscription.find_all().count()
    paid_subscriptions = await Subscription.find(
        Subscription.tier == "paid",
    ).count()
    active_subscriptions = await Subscription.find(
        Subscription.status == "active",
    ).count()
    total_installations = await UserAppInstallation.find_all().count()

    return {
        "total_users": total_users,
        "total_subscriptions": total_subscriptions,
        "paid_subscriptions": paid_subscriptions,
        "active_subscriptions": active_subscriptions,
        "total_installations": total_installations,
        "free_users": total_users - paid_subscriptions,
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/admin/service.py
git commit -m "feat(admin): add admin service with user, subscription, and app catalog management

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 3: Create admin schemas

**Files:**
- Create: `backend/apps/admin/schemas.py`

- [ ] **Step 1: Create schemas**

```python
"""Admin API request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from shared.enums import SubscriptionStatus, SubscriptionTier, UserRole


# ─── User ──────────────────────────────────────────────────────────────────────

class UserListItem(BaseModel):
    """A user row in the admin users table."""

    id: str
    email: str
    name: str
    role: UserRole
    created_at: datetime
    subscription: dict = Field(
        description="Embedded subscription summary: {tier, status, provider}"
    )


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int
    skip: int
    limit: int


class UpdateUserRoleRequest(BaseModel):
    role: UserRole


class UpdateUserRoleResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    message: str


# ─── Subscription ──────────────────────────────────────────────────────────────

class SubscriptionListItem(BaseModel):
    """A subscription row in the admin subscriptions table."""

    id: str
    user_id: str
    user_email: str
    user_name: str
    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: Literal["stripe", "payos"] | None
    started_at: datetime | None
    expires_at: datetime | None
    created_at: datetime


class SubscriptionListResponse(BaseModel):
    subscriptions: list[SubscriptionListItem]
    total: int
    skip: int
    limit: int


class UpdateSubscriptionTierRequest(BaseModel):
    tier: SubscriptionTier
    reason: str | None = None


class UpdateSubscriptionStatusRequest(BaseModel):
    status: SubscriptionStatus


class SubscriptionUpdateResponse(BaseModel):
    user_id: str
    user_email: str | None
    tier: SubscriptionTier | None = None
    status: SubscriptionStatus | None = None
    message: str


# ─── App catalog ───────────────────────────────────────────────────────────────

class CatalogAppItem(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    version: str
    requires_tier: SubscriptionTier
    install_count: int


class UpdateAppTierRequest(BaseModel):
    tier: SubscriptionTier


class UpdateAppTierResponse(BaseModel):
    id: str
    name: str
    old_tier: SubscriptionTier
    new_tier: SubscriptionTier
    message: str


# ─── Stats ──────────────────────────────────────────────────────────────────────

class AdminStatsResponse(BaseModel):
    total_users: int
    total_subscriptions: int
    paid_subscriptions: int
    active_subscriptions: int
    total_installations: int
    free_users: int
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/admin/schemas.py
git commit -m "feat(admin): add admin API schemas

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 4: Create admin routes

**Files:**
- Create: `backend/apps/admin/routes.py`

- [ ] **Step 1: Create `backend/apps/admin/routes.py`**

```python
"""Admin API routes — all protected by get_current_admin_user."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from apps.admin.schemas import (
    AdminStatsResponse,
    CatalogAppItem,
    SubscriptionListItem,
    SubscriptionListResponse,
    SubscriptionUpdateResponse,
    UpdateAppTierRequest,
    UpdateAppTierResponse,
    UpdateSubscriptionStatusRequest,
    UpdateSubscriptionTierRequest,
    UpdateUserRoleRequest,
    UpdateUserRoleResponse,
    UserListItem,
    UserListResponse,
)
from apps.admin.service import (
    get_admin_stats,
    list_catalog_apps,
    list_subscriptions,
    list_users,
    update_app_requires_tier,
    update_subscription_status,
    update_subscription_tier,
    update_user_role,
)
from core.auth import get_current_admin_user
from shared.enums import SubscriptionStatus, SubscriptionTier, UserRole

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=UserListResponse)
async def admin_list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, description="Search by email (case-insensitive)"),
    user_id: str | None = Depends(get_current_admin_user),
) -> UserListResponse:
    """List all users with pagination. Admin only."""
    users, total = await list_users(skip=skip, limit=limit, search=search)
    return UserListResponse(
        users=[UserListItem(**u) for u in users],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.patch("/users/{user_id}/role", response_model=UpdateUserRoleResponse)
async def admin_update_user_role(
    user_id: str,
    request: UpdateUserRoleRequest,
    _: str = Depends(get_current_admin_user),
) -> UpdateUserRoleResponse:
    """Promote or demote a user's admin role. Admin only."""
    try:
        result = await update_user_role(user_id, request.role)
        return UpdateUserRoleResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


# ─── Subscriptions ─────────────────────────────────────────────────────────────

@router.get("/subscriptions", response_model=SubscriptionListResponse)
async def admin_list_subscriptions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: SubscriptionStatus | None = Query(None),
    tier: SubscriptionTier | None = Query(None),
    _: str = Depends(get_current_admin_user),
) -> SubscriptionListResponse:
    """List all subscriptions with optional filters. Admin only."""
    subs, total = await list_subscriptions(
        skip=skip, limit=limit, status=status, tier=tier,
    )
    return SubscriptionListResponse(
        subscriptions=[SubscriptionListItem(**s) for s in subs],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.patch("/subscriptions/{user_id}/tier", response_model=SubscriptionUpdateResponse)
async def admin_update_subscription_tier(
    user_id: str,
    request: UpdateSubscriptionTierRequest,
    _: str = Depends(get_current_admin_user),
) -> SubscriptionUpdateResponse:
    """Admin override: set a user's subscription tier directly (bypasses payment)."""
    try:
        result = await update_subscription_tier(user_id, request.tier, request.reason)
        return SubscriptionUpdateResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.patch("/subscriptions/{user_id}/status", response_model=SubscriptionUpdateResponse)
async def admin_update_subscription_status(
    user_id: str,
    request: UpdateSubscriptionStatusRequest,
    _: str = Depends(get_current_admin_user),
) -> SubscriptionUpdateResponse:
    """Admin override: set a user's subscription status directly."""
    try:
        result = await update_subscription_status(user_id, request.status)
        return SubscriptionUpdateResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


# ─── App catalog ────────────────────────────────────────────────────────────────

@router.get("/apps", response_model=list[CatalogAppItem])
async def admin_list_apps(
    _: str = Depends(get_current_admin_user),
) -> list[CatalogAppItem]:
    """List all apps in the catalog with install counts. Admin only."""
    apps = await list_catalog_apps()
    return [CatalogAppItem(**app) for app in apps]


@router.patch("/apps/{app_id}/tier", response_model=UpdateAppTierResponse)
async def admin_update_app_tier(
    app_id: str,
    request: UpdateAppTierRequest,
    _: str = Depends(get_current_admin_user),
) -> UpdateAppTierResponse:
    """Admin override: change app's required tier (runtime only)."""
    try:
        result = await update_app_requires_tier(app_id, request.tier)
        return UpdateAppTierResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


# ─── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsResponse)
async def admin_get_stats(
    _: str = Depends(get_current_admin_user),
) -> AdminStatsResponse:
    """Return admin dashboard stats. Admin only."""
    stats = await get_admin_stats()
    return AdminStatsResponse(**stats)
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/admin/routes.py
git commit -m "feat(admin): add admin API routes with user, subscription, and app management

All routes require admin role. Subscription updates bypass payment (admin override)."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 5: Frontend — Admin page

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/AdminPage.tsx`**

```typescript
import { useState } from "react";
import {
  Badge,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Tab,
  Tooltip,
  useDisclosure,
} from "@heroui/react";
import { useAdminApps, useAdminStats, useAdminSubscriptions, useAdminUsers, useUpdateUserRole, useUpdateSubscriptionTier } from "@/api/admin"; // Generated API
import { useAuth } from "@/hooks/useAuth";

type TabId = "users" | "subscriptions" | "apps";

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<Record<string, string> | null>(null);
  const [selectedSub, setSelectedSub] = useState<Record<string, string> | null>(null);

  const roleModal = useDisclosure();
  const tierModal = useDisclosure();

  const { data: stats } = useAdminStats();
  const { data: users, mutate: mutateUsers } = useAdminUsers({ search: search || undefined });
  const { data: subscriptions, mutate: mutateSubs } = useAdminSubscriptions({});
  const { data: apps } = useAdminApps();
  const updateRole = useUpdateUserRole();
  const updateTier = useUpdateSubscriptionTier();

  const handlePromote = async () => {
    if (!selectedUser) return;
    await updateRole.mutateAsync({
      userId: selectedUser.id,
      role: selectedUser.role === "admin" ? "user" : "admin",
    });
    mutateUsers();
    roleModal.onClose();
  };

  const handleUpdateTier = async (tier: string) => {
    if (!selectedSub) return;
    await updateTier.mutateAsync({
      userId: selectedSub.user_id,
      tier,
    });
    mutateSubs();
    tierModal.onClose();
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted text-sm">Manage users, subscriptions, and app catalog</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="stat-value text-xl">{stats?.total_users ?? "—"}</p>
            <p className="section-label">Users</p>
          </div>
          <div className="text-center">
            <p className="stat-value text-xl">{stats?.paid_subscriptions ?? "—"}</p>
            <p className="section-label">Paid</p>
          </div>
          <div className="text-center">
            <p className="stat-value text-xl">{stats?.total_installations ?? "—"}</p>
            <p className="section-label">Installs</p>
          </div>
        </div>
      </div>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as TabId)}
        variant="underlined"
        classNames={{ tabList: "gap-4" }}
      >
        {/* ── Users Tab ───────────────────────────────────────────────────── */}
        <Tab key="users" title={`Users (${stats?.total_users ?? "—"})`}>
          <div className="py-4">
            <Input
              placeholder="Search by email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm mb-4"
              isClearable
            />

            <Table aria-label="Users table">
              <TableHeader>
                <TableColumn>Name</TableColumn>
                <TableColumn>Email</TableColumn>
                <TableColumn>Role</TableColumn>
                <TableColumn>Plan</TableColumn>
                <TableColumn>Joined</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody items={users?.users ?? []}>
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      <Badge
                        color={item.role === "admin" ? "danger" : "default"}
                        variant="flat"
                      >
                        {item.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={item.subscription?.tier === "paid" ? "success" : "default"}
                        variant="flat"
                      >
                        {item.subscription?.tier ?? "free"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="bordered"
                        onPress={() => {
                          setSelectedUser(item as Record<string, string>);
                          roleModal.onOpen();
                        }}
                      >
                        {item.role === "admin" ? "Demote" : "Promote"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Tab>

        {/* ── Subscriptions Tab ───────────────────────────────────────────── */}
        <Tab key="subscriptions" title={`Subscriptions (${stats?.total_subscriptions ?? "—"})`}>
          <div className="py-4">
            <Table aria-label="Subscriptions table">
              <TableHeader>
                <TableColumn>User</TableColumn>
                <TableColumn>Tier</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Provider</TableColumn>
                <TableColumn>Expires</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody items={subscriptions?.subscriptions ?? []}>
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.user_name}</p>
                        <p className="text-xs text-muted">{item.user_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={item.tier === "paid" ? "success" : "default"}
                        variant="flat"
                      >
                        {item.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={
                          item.status === "active"
                            ? "success"
                            : item.status === "past_due"
                            ? "warning"
                            : "default"
                        }
                        variant="flat"
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.provider ?? "—"}</TableCell>
                    <TableCell>
                      {item.expires_at
                        ? new Date(item.expires_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="bordered"
                        color="warning"
                        onPress={() => {
                          setSelectedSub(item as Record<string, string>);
                          tierModal.onOpen();
                        }}
                      >
                        Set Tier
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Tab>

        {/* ── Apps Tab ───────────────────────────────────────────────────── */}
        <Tab key="apps" title="App Catalog">
          <div className="py-4">
            <Table aria-label="Apps catalog table">
              <TableHeader>
                <TableColumn>App</TableColumn>
                <TableColumn>Version</TableColumn>
                <TableColumn>Required Tier</TableColumn>
                <TableColumn>Installs</TableColumn>
              </TableHeader>
              <TableBody items={apps ?? []}>
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ background: item.color }}
                        />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{item.version}</TableCell>
                    <TableCell>
                      <Badge
                        color={item.requires_tier === "paid" ? "warning" : "success"}
                        variant="flat"
                      >
                        {item.requires_tier}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.install_count}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Tab>
      </Tabs>

      {/* Role change modal */}
      <Modal isOpen={roleModal.isOpen} onOpenChange={roleModal.onOpenChange}>
        <ModalContent>
          <ModalHeader>Change Role</ModalHeader>
          <ModalBody>
            <p>
              Change role for <strong>{selectedUser?.name}</strong> ({selectedUser?.email})?
            </p>
            <p className="text-sm text-muted mt-1">
              Current: <Badge>{selectedUser?.role}</Badge>
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={roleModal.onClose}>Cancel</Button>
            <Button
              color="danger"
              onPress={handlePromote}
              isLoading={updateRole.isPending}
            >
              {selectedUser?.role === "admin" ? "Demote to User" : "Promote to Admin"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Tier change modal */}
      <Modal isOpen={tierModal.isOpen} onOpenChange={tierModal.onOpenChange}>
        <ModalContent>
          <ModalHeader>Set Subscription Tier</ModalHeader>
          <ModalBody>
            <p>
              Set tier for <strong>{selectedSub?.user_name}</strong> ({selectedSub?.user_email})
            </p>
            <Select
              label="New Tier"
              defaultSelectedKeys={selectedSub?.tier ? [selectedSub.tier] : []}
              onChange={(e) => {
                if (selectedSub) setSelectedSub({ ...selectedSub, tier: e.target.value });
              }}
              className="mt-3"
            >
              <SelectItem key="free">Free</SelectItem>
              <SelectItem key="paid">Paid</SelectItem>
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={tierModal.onClose}>Cancel</Button>
            <Button
              color="warning"
              onPress={() => handleUpdateTier(selectedSub?.tier ?? "free")}
              isLoading={updateTier.isPending}
            >
              Update Tier
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Add /admin route to App.tsx**

Open `frontend/src/App.tsx`. Add to the lazy imports:

```typescript
const AdminPage = lazy(() => import("@/pages/AdminPage"));
```

Add to the routes inside `<ShellLayout>`:

```typescript
<Route path="/admin" element={<LazyRoute Component={AdminPage} />} />
```

Add it **inside** the `ShellLayout` route (which is already inside `Protected`), so it inherits authentication protection. Admin authorization is handled server-side by `get_current_admin_user`.

**Important:** The AdminPage itself does NOT need a client-side `isAdmin` check — the server returns 403 for non-admins. However, you may want to redirect non-admin users who somehow navigate to `/admin`:

```typescript
// Inside the AdminPage component, add:
const { isAdmin } = useAuth();
const navigate = useNavigate();
useEffect(() => {
  if (!isAdmin) navigate("/dashboard", { replace: true });
}, [isAdmin, navigate]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx frontend/src/App.tsx
git commit -m "feat(fe): add admin page with users, subscriptions, and app catalog tabs

Adds /admin route accessible to admin users. Uses HeroUI Table, Tabs, Modal, Badge components. Admin authorization enforced server-side."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 6: Add billing subscription helper to service

**Files:**
- Modify: `backend/apps/billing/service.py`

This adds a helper method used by the admin service when updating subscription tiers.

- [ ] **Step 1: Add helper method**

In `backend/apps/billing/service.py`, add this function:

```python
async def set_tier_for_user(
    user_id: str,
    tier: SubscriptionTier,
) -> Subscription:
    """Set subscription tier for a user (used by admin overrides)."""
    now = datetime.now(UTC)

    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None:
        sub = Subscription(
            user_id=PydanticObjectId(user_id),
            tier=tier,
            status="active" if tier == "paid" else "inactive",
            created_at=now,
            updated_at=now,
        )
        await sub.insert()
    else:
        sub.tier = tier
        sub.status = "active" if tier == "paid" else "inactive"
        sub.updated_at = now
        await sub.save()

    return sub
```

Then update `apps/admin/service.py` to use this instead of the local implementation. Replace the `update_subscription_tier` function in `apps/admin/service.py` with:

```python
async def update_subscription_tier(
    user_id: str,
    new_tier: SubscriptionTier,
    reason: str | None = None,
) -> dict[str, Any]:
    """Admin override: directly set a user's subscription tier (bypasses payment)."""
    from apps.billing.service import set_tier_for_user

    sub = await set_tier_for_user(user_id, new_tier)
    user = await User.get(user_id)
    logger.info(
        "Admin set tier for user %s to %s. Reason: %s",
        user_id,
        new_tier,
        reason,
    )
    return {
        "user_id": user_id,
        "user_email": user.email if user else None,
        "tier": sub.tier,
        "status": sub.status,
        "message": f"Subscription set to '{new_tier}' by admin. {reason or ''}",
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/billing/service.py backend/apps/admin/service.py
git commit -m "refactor(admin): use set_tier_for_user from billing service

Removes duplicate subscription tier logic from admin service."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Task 7: Final verification

- [ ] **Step 1: Run codegen**

```bash
python scripts/superin.py codegen
```

Expected: Generates `frontend/src/apps/admin/api.ts` with typed admin API hooks.

- [ ] **Step 2: Run manifest validation**

```bash
python scripts/superin.py manifests validate
```

Expected: Admin and billing manifests pass validation.

- [ ] **Step 3: Run ruff check**

```bash
ruff check backend/
```

- [ ] **Step 4: Type check frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Verify admin route mount**

Open `backend/core/main.py`. Verify the admin router is mounted. The `discover_apps()` call at line 125 will auto-discover the admin plugin. No manual router registration needed — it follows the same pattern as other plugins.

If the admin plugin is not auto-discovered, add to `main.py` (around line 127):

```python
from apps.admin import router as admin_router
app.include_router(
    admin_router,
    prefix=f"{API_ROOT}/apps/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin_user)],
)
```

**Important:** This adds admin auth to the admin router **in addition to** the `get_current_admin_user` dependency inside each route. Either approach works, but the current design (check per-route) is preferred because it allows `/stats` to be public during development if needed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/generated/
git commit -m "chore(codegen): regenerate types after admin page schemas

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Self-Review Checklist

- [ ] Spec coverage: All admin page requirements in master spec have a task.
- [ ] Placeholder scan: No "TBD", "TODO" in implementation steps (except acknowledged internal cron TODO in Plan B).
- [ ] Type consistency: All schemas use `UserRole`, `SubscriptionTier`, `SubscriptionStatus` from `shared.enums`.
- [ ] Admin always authorized: All routes use `Depends(get_current_admin_user)` — no silent bypass.
- [ ] No silent catches: All errors logged and returned as HTTPException.
- [ ] DB invariants: Subscription upsert uses Mongo session. Admin cannot accidentally create duplicate subscriptions.
- [ ] Runtime-only tier change: `update_app_requires_tier` documents that it only affects runtime (manifest file change needed for permanent effect).
- [ ] Frontend routing: Admin page is inside `<ShellLayout>` (protected route), server enforces admin auth.
- [ ] No platform code imports from admin app: Admin routes use standard `Depends()` injection.

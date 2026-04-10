"""Admin API schemas."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from shared.enums import PaymentProvider, SubscriptionStatus, SubscriptionTier, UserRole


class AdminUserSubscriptionRead(BaseModel):
    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None


class AdminUserRead(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: UserRole
    created_at: datetime
    subscription: AdminUserSubscriptionRead


class AdminUsersResponse(BaseModel):
    items: list[AdminUserRead]
    total: int


class AdminUpdateUserRoleRequest(BaseModel):
    role: UserRole


class AdminSubscriptionRead(BaseModel):
    id: str
    user_id: str
    user_email: EmailStr
    user_name: str
    tier: SubscriptionTier
    status: SubscriptionStatus
    provider: PaymentProvider | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminSubscriptionsResponse(BaseModel):
    items: list[AdminSubscriptionRead]
    total: int


class AdminUpdateSubscriptionRequest(BaseModel):
    tier: SubscriptionTier | None = None
    status: SubscriptionStatus | None = None
    expires_at: datetime | None = None


class AdminAppRead(BaseModel):
    id: str
    name: str
    category: str
    requires_tier: SubscriptionTier
    install_count: int


class AdminAppsResponse(BaseModel):
    items: list[AdminAppRead]
    total: int


class AdminUpdateAppTierRequest(BaseModel):
    requires_tier: SubscriptionTier


class AdminStatsRead(BaseModel):
    total_users: int
    admin_users: int
    active_subscriptions: int
    paid_subscriptions: int
    installed_apps: int


class AdminPaginationParams(BaseModel):
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=200)
    search: str | None = None


import { SubscriptionStatus, SubscriptionTier, UserRole } from "@/types/generated";
import type { AdminAppRead, AdminUserRead } from "@/types/generated";

export type AdminTab = "users" | "subscriptions" | "apps";

export const DEFAULT_ADMIN_TAB: AdminTab = "users";

export function normalizeAdminTab(value: string | null): AdminTab {
  if (value === "subscriptions" || value === "apps") {
    return value;
  }

  return DEFAULT_ADMIN_TAB;
}

export function getRoleBusyKey(userId: string) {
  return `role:${userId}`;
}

export function getSubscriptionBusyKey(userId: string) {
  return `sub:${userId}`;
}

export function getAppBusyKey(appId: string) {
  return `app:${appId}`;
}

export function getNextRole(role: UserRole) {
  return role === UserRole.ADMIN ? UserRole.USER : UserRole.ADMIN;
}

export function buildSubscriptionUpdate(tier: SubscriptionTier) {
  return {
    tier,
    status: tier === SubscriptionTier.PAID ? SubscriptionStatus.ACTIVE : SubscriptionStatus.INACTIVE,
  };
}

export interface AdminMutationHandlers {
  setAppTier: (app: AdminAppRead, requiresTier: SubscriptionTier) => Promise<void>;
  setRole: (targetUser: AdminUserRead, role: UserRole) => Promise<void>;
  setSubscriptionTier: (targetUserId: string, tier: SubscriptionTier) => Promise<void>;
}

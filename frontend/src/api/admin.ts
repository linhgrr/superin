/**
 * Admin API — platform-level admin management endpoints.
 */

import type {
  AdminAppRead,
  AdminAppsResponse,
  AdminStatsRead,
  AdminSubscriptionRead,
  AdminSubscriptionsResponse,
  AdminUpdateAppTierRequest,
  AdminUpdateSubscriptionRequest,
  AdminUpdateUserRoleRequest,
  AdminUserRead,
  AdminUsersResponse,
  operations,
} from "@/types/generated";
import { API_PATHS } from "@/constants";
import { api } from "./axios";

type AdminUsersParams =
  operations["get_admin_users_api_admin_users_get"]["parameters"]["query"];
type AdminSubscriptionsParams =
  operations["get_admin_subscriptions_api_admin_subscriptions_get"]["parameters"]["query"];

export async function getAdminStats(): Promise<AdminStatsRead> {
  return api.get<AdminStatsRead>(API_PATHS.ADMIN_STATS);
}

export async function getAdminUsers(params: AdminUsersParams = {}): Promise<AdminUsersResponse> {
  const { skip = 0, limit = 50, search } = params;
  return api.get<AdminUsersResponse>(API_PATHS.ADMIN_USERS, {
    params: {
      skip,
      limit,
      ...(search ? { search } : {}),
    },
  });
}

export async function updateAdminUserRole(
  userId: string,
  payload: AdminUpdateUserRoleRequest,
): Promise<AdminUserRead> {
  return api.patch<AdminUserRead>(API_PATHS.ADMIN_USER_ROLE(userId), payload);
}

export async function getAdminSubscriptions(
  params: AdminSubscriptionsParams = {},
): Promise<AdminSubscriptionsResponse> {
  const { skip = 0, limit = 50, status, tier } = params;
  return api.get<AdminSubscriptionsResponse>(API_PATHS.ADMIN_SUBSCRIPTIONS, {
    params: {
      skip,
      limit,
      ...(status ? { status } : {}),
      ...(tier ? { tier } : {}),
    },
  });
}

export async function updateAdminSubscription(
  userId: string,
  payload: AdminUpdateSubscriptionRequest,
): Promise<AdminSubscriptionRead> {
  return api.patch<AdminSubscriptionRead>(API_PATHS.ADMIN_SUBSCRIPTION_USER(userId), payload);
}

export async function getAdminApps(): Promise<AdminAppsResponse> {
  return api.get<AdminAppsResponse>(API_PATHS.ADMIN_APPS);
}

export async function updateAdminAppTier(
  appId: string,
  payload: AdminUpdateAppTierRequest,
): Promise<AdminAppRead> {
  return api.patch<AdminAppRead>(API_PATHS.ADMIN_APP_TIER(appId), payload);
}

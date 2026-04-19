import { useState } from "react";
import useSWR from "swr";

import {
  getAdminApps,
  getAdminStats,
  getAdminSubscriptions,
  getAdminUsers,
  updateAdminAppTier,
  updateAdminSubscription,
  updateAdminUserRole,
} from "@/api/admin";
import { useToast } from "@/components/providers/ToastProvider";
import { SubscriptionTier, UserRole } from "@/types/generated";
import type { AdminAppRead, AdminUserRead } from "@/types/generated";

import {
  buildSubscriptionUpdate,
  getAppBusyKey,
  getRoleBusyKey,
  getSubscriptionBusyKey,
} from "./admin-page-state";

export function useAdminConsole(search: string) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const toast = useToast();

  const statsSwr = useSWR("admin:stats", getAdminStats);
  const usersSwr = useSWR(["admin:users", search], () => getAdminUsers({ search }));
  const subscriptionsSwr = useSWR("admin:subscriptions", () => getAdminSubscriptions({ limit: 200 }));
  const appsSwr = useSWR("admin:apps", getAdminApps);

  const isRefreshing =
    statsSwr.isLoading || usersSwr.isLoading || subscriptionsSwr.isLoading || appsSwr.isLoading;

  async function refreshAll() {
    await Promise.all([
      statsSwr.mutate(),
      usersSwr.mutate(),
      subscriptionsSwr.mutate(),
      appsSwr.mutate(),
    ]);
  }

  async function setRole(targetUser: AdminUserRead, role: UserRole) {
    const key = getRoleBusyKey(targetUser.id);
    setBusyKey(key);
    try {
      await updateAdminUserRole(targetUser.id, { role });
      await Promise.all([usersSwr.mutate(), statsSwr.mutate()]);
      toast.success(`Updated role for ${targetUser.email}`);
    } catch (error: unknown) {
      console.error("Failed to update user role", error);
      toast.error(`Failed to update role for ${targetUser.email}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function setSubscriptionTier(targetUserId: string, tier: SubscriptionTier) {
    const key = getSubscriptionBusyKey(targetUserId);
    setBusyKey(key);
    try {
      await updateAdminSubscription(targetUserId, buildSubscriptionUpdate(tier));
      await Promise.all([usersSwr.mutate(), subscriptionsSwr.mutate(), statsSwr.mutate()]);
      toast.success("Updated subscription");
    } catch (error: unknown) {
      console.error("Failed to update subscription", error);
      toast.error("Failed to update subscription");
    } finally {
      setBusyKey(null);
    }
  }

  async function setAppTier(app: AdminAppRead, requiresTier: SubscriptionTier) {
    const key = getAppBusyKey(app.id);
    setBusyKey(key);
    try {
      await updateAdminAppTier(app.id, { requires_tier: requiresTier });
      await appsSwr.mutate();
      toast.success(`Updated ${app.name} tier requirement`);
    } catch (error: unknown) {
      console.error("Failed to update app tier", error);
      toast.error(`Failed to update ${app.name}`);
    } finally {
      setBusyKey(null);
    }
  }

  return {
    apps: appsSwr.data?.items ?? [],
    busyKey,
    isRefreshing,
    refreshAll,
    setAppTier,
    setRole,
    setSubscriptionTier,
    stats: statsSwr.data,
    subscriptions: subscriptionsSwr.data?.items ?? [],
    users: usersSwr.data?.items ?? [],
  };
}

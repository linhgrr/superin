/**
 * AdminPage — platform administration console.
 */

import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Shield from "lucide-react/dist/esm/icons/shield";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { useAuth } from "@/hooks/useAuth";
import { SubscriptionStatus, SubscriptionTier } from "@/types/generated";
import type { AdminAppRead } from "@/types/generated";
import { AdminStats } from "./AdminStats";
import { AdminTabs } from "./AdminTabs";
import { AppsTab } from "./AppsTab";
import { SubscriptionsTab } from "./SubscriptionsTab";
import { UsersTab } from "./UsersTab";

type AdminTab = "users" | "subscriptions" | "apps";
const DEFAULT_ADMIN_TAB: AdminTab = "users";

function normalizeAdminTab(value: string | null): AdminTab {
  if (value === "subscriptions" || value === "apps") {
    return value;
  }

  return DEFAULT_ADMIN_TAB;
}

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const tab = normalizeAdminTab(searchParams.get("tab"));
  const search = searchParams.get("q") ?? "";

  const updateAdminSearchParams = useCallback(
    (updates: { q?: string; tab?: AdminTab }) => {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);

        if (updates.tab !== undefined) {
          if (updates.tab === DEFAULT_ADMIN_TAB) {
            nextParams.delete("tab");
          } else {
            nextParams.set("tab", updates.tab);
          }
        }

        if (updates.q !== undefined) {
          const nextQuery = updates.q.trim();
          if (!nextQuery) {
            nextParams.delete("q");
          } else {
            nextParams.set("q", nextQuery);
          }
        }

        return nextParams;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const statsSwr = useSWR("admin:stats", getAdminStats);
  const usersSwr = useSWR(["admin:users", search], () => getAdminUsers({ search }));
  const subscriptionsSwr = useSWR("admin:subscriptions", () => getAdminSubscriptions({ limit: 200 }));
  const appsSwr = useSWR("admin:apps", getAdminApps);

  const totalLoading = statsSwr.isLoading || usersSwr.isLoading || subscriptionsSwr.isLoading || appsSwr.isLoading;

  async function refreshAll() {
    await Promise.all([
      statsSwr.mutate(),
      usersSwr.mutate(),
      subscriptionsSwr.mutate(),
      appsSwr.mutate(),
    ]);
  }

  async function setRole(targetUser: { id: string; email: string }, role: import("@/types/generated").UserRole) {
    const key = `role:${targetUser.id}`;
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
    const key = `sub:${targetUserId}`;
    setBusyKey(key);
    try {
      await updateAdminSubscription(targetUserId, {
        tier,
        status: tier === SubscriptionTier.PAID ? SubscriptionStatus.ACTIVE : SubscriptionStatus.INACTIVE,
      });
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
    const key = `app:${app.id}`;
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

  if (!isAdmin) {
    return (
      <div className="widget-card" style={{ maxWidth: "560px" }}>
        <div className="widget-card-title" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Shield size={18} />
          Admin Access Required
        </div>
        <p style={{ color: "var(--color-foreground-muted)", margin: 0 }}>
          This area is restricted to admin users.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>Admin</h1>
          <p style={{ margin: "0.35rem 0 0", color: "var(--color-foreground-muted)" }}>
            Manage users, subscriptions, and app access policy.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={refreshAll} disabled={totalLoading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <AdminStats stats={statsSwr.data} />

      <AdminTabs
        tab={tab}
        onTabChange={(nextTab) => updateAdminSearchParams({ tab: nextTab })}
        search={search}
        onSearchChange={(nextSearch) => updateAdminSearchParams({ q: nextSearch })}
      />

      {tab === "users" && (
        <UsersTab
          users={usersSwr.data?.items ?? []}
          currentUserId={user?.id}
          busyKey={busyKey}
          onSetRole={setRole}
          onSetTier={setSubscriptionTier}
        />
      )}

      {tab === "subscriptions" && (
        <SubscriptionsTab subscriptions={subscriptionsSwr.data?.items ?? []} />
      )}

      {tab === "apps" && (
        <AppsTab apps={appsSwr.data?.items ?? []} busyKey={busyKey} onSetTier={setAppTier} />
      )}
    </div>
  );
}

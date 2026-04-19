/**
 * AdminPage — platform administration console.
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

import { AdminAccessRequired, AdminPageHeader } from "./AdminPageSections";
import { AdminStats } from "./AdminStats";
import { AdminTabs } from "./AdminTabs";
import { AppsTab } from "./AppsTab";
import { SubscriptionsTab } from "./SubscriptionsTab";
import { UsersTab } from "./UsersTab";
import type { AdminTab } from "./admin-page-state";
import { DEFAULT_ADMIN_TAB, normalizeAdminTab } from "./admin-page-state";
import { useAdminConsole } from "./useAdminConsole";

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const tab = normalizeAdminTab(searchParams.get("tab"));
  const search = searchParams.get("q") ?? "";
  const {
    apps,
    busyKey,
    isRefreshing,
    refreshAll,
    setAppTier,
    setRole,
    setSubscriptionTier,
    stats,
    subscriptions,
    users,
  } = useAdminConsole(search);

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
    [setSearchParams],
  );

  if (!isAdmin) {
    return <AdminAccessRequired />;
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <AdminPageHeader isRefreshing={isRefreshing} onRefresh={refreshAll} />

      <AdminStats stats={stats} />

      <AdminTabs
        tab={tab}
        onTabChange={(nextTab) => updateAdminSearchParams({ tab: nextTab })}
        search={search}
        onSearchChange={(nextSearch) => updateAdminSearchParams({ q: nextSearch })}
      />

      {tab === "users" && (
        <UsersTab
          users={users}
          currentUserId={user?.id}
          busyKey={busyKey}
          onSetRole={setRole}
          onSetTier={setSubscriptionTier}
        />
      )}

      {tab === "subscriptions" && (
        <SubscriptionsTab subscriptions={subscriptions} />
      )}

      {tab === "apps" && (
        <AppsTab apps={apps} busyKey={busyKey} onSetTier={setAppTier} />
      )}
    </div>
  );
}

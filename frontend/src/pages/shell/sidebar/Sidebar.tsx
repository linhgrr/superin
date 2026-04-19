"use client";

import { memo, useMemo } from "react";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/hooks/useAuth";
import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";
import { useInstalledApps } from "@/stores/platform/workspaceStore";

import {
  MemoSidebarAppLink,
  MemoSidebarBrand,
  MemoSidebarLink,
  MemoSidebarSection,
  type SidebarStaticItem,
} from "./sidebar-parts";

const PRIMARY_ITEMS = [
  { icon: "LayoutDashboard", title: "Dashboard", to: ROUTES.DASHBOARD },
  { icon: "Store", title: "App Store", to: ROUTES.STORE },
] as const satisfies readonly SidebarStaticItem[];

const FOOTER_ITEMS = [
  { icon: "CreditCard", isUtility: true, title: "Billing", to: ROUTES.BILLING },
  { icon: "Settings", isUtility: true, title: "Settings", to: ROUTES.SETTINGS },
] as const satisfies readonly SidebarStaticItem[];

function Sidebar() {
  const installedApps = useInstalledApps();
  const { isAdmin } = useAuth();
  const collapsed = usePlatformUiStore(platformUiSelectors.isDesktopSidebarCollapsed);
  const toggleDesktopSidebar = usePlatformUiStore(platformUiSelectors.toggleDesktopSidebar);

  const footerItems = useMemo(() => {
    const items = [...FOOTER_ITEMS];
    if (isAdmin) {
      items.splice(1, 0, {
        icon: "Shield",
        isUtility: true,
        title: "Admin",
        to: ROUTES.ADMIN,
      });
    }
    return items;
  }, [isAdmin]);

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`} data-sidebar-collapsed={collapsed}>
      <MemoSidebarBrand collapsed={collapsed} onToggle={toggleDesktopSidebar} />

      <nav className="sidebar-nav" aria-label="Primary navigation">
        <MemoSidebarSection>
          {PRIMARY_ITEMS.map((item) => (
            <MemoSidebarLink key={item.to} collapsed={collapsed} item={item} />
          ))}
        </MemoSidebarSection>

        {installedApps.length > 0 ? (
          <MemoSidebarSection title="Apps">
            {installedApps.map((app) => (
              <MemoSidebarAppLink key={app.id} app={app} collapsed={collapsed} />
            ))}
          </MemoSidebarSection>
        ) : null}
      </nav>

      <div className="sidebar-footer">
        <MemoSidebarSection title="Workspace">
          {footerItems.map((item) => (
            <MemoSidebarLink key={item.to} collapsed={collapsed} item={item} />
          ))}
        </MemoSidebarSection>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

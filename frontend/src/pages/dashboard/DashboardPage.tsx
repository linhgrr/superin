/**
 * DashboardPage — refined dashboard experience.
 *
 * Architecture:
 *   DashboardPage
 *   ├── WelcomeTour       (auto-start onboarding for first-time users)
 *   └── DashboardGrid      (draggable widget grid + AddWidgetButton)
 */

import { useMemo } from "react";

import {
  useInstalledApps,
  useWidgetPreferences,
  useWorkspaceStore,
} from "@/stores/platform/workspaceStore";
import { getSizeConfig } from "./layout-engine";
import { ROW_HEIGHT } from "./useWidgetPreferences";
import DashboardGrid from "./DashboardGrid";
import WelcomeTour from "./WelcomeTour";

// Must be declared before hooks so hook ordering is stable across renders
const SKELETON_SIZES = ["standard", "wide", "standard", "compact", "standard"] as const;

function DashboardSkeleton() {
  return (
    <div className="widget-grid">
      {SKELETON_SIZES.map((size, i) => {
        const config = getSizeConfig(size);
        return (
          <div key={i} className={`widget-size-${size}`}>
            <div
              className="widget-card"
              style={{
                // Use pixel height matching actual grid row span (rglH * ROW_HEIGHT)
                minHeight: config.rglH * ROW_HEIGHT,
                background: "var(--color-surface-elevated)",
                animation: `pulse 1.5s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const applyPreferenceUpdates = useWorkspaceStore((state) => state.applyPreferenceUpdates);
  const installedApps = useInstalledApps();
  const isWorkspaceLoading = useWorkspaceStore((state) => state.isWorkspaceLoading);
  const widgetPreferences = useWidgetPreferences();

  // Hooks MUST be called before any conditional returns
  const allWidgets = useMemo(
    () => installedApps.flatMap((app) => app.widgets ?? []),
    [installedApps]
  );

  if (isWorkspaceLoading) {
    return <DashboardSkeleton />;
  }

  if (allWidgets.length === 0) {
    return (
      <div className="empty-state" style={{ height: "60vh" }}>
        <div className="empty-state-icon" style={{ background: "transparent", boxShadow: "none", width: "auto", height: "auto" }}>
          <img src="/branding/logo.png" alt="Logo" className="theme-logo-light" style={{ width: "48px", height: "auto", opacity: 0.5 }} />
          <img src="/branding/logo-white.png" alt="Logo" className="theme-logo-dark" style={{ width: "48px", height: "auto", opacity: 0.5 }} />
        </div>
        <h3 className="empty-state-title">Welcome to Superin</h3>
        <p className="empty-state-description">
          Your dashboard is empty. Visit the{" "}
          <a
            href="/store"
            style={{ color: "var(--color-primary)", fontWeight: 600 }}
          >
            App Store
          </a>{" "}
          to install your first app.
        </p>
      </div>
    );
  }

  return (
    <>
      <WelcomeTour isWorkspaceLoading={isWorkspaceLoading} />
      <DashboardGrid
        installedApps={installedApps}
        workspacePreferences={widgetPreferences}
        onCommit={applyPreferenceUpdates}
      />
    </>
  );
}

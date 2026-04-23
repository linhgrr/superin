/**
 * AppPage — /apps/:appId — full app experience page.
 *
 * Renders app-specific layout by delegating to app sub-components.
 * Lazy loads app components on demand.
 * Delays skeleton briefly to avoid flashing on fast cached navigations.
 */

import { memo, useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useParams } from "react-router-dom";
import Construction from "lucide-react/dist/esm/icons/construction";
import Download from "lucide-react/dist/esm/icons/download";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import { getAppMetadata, getLoadedAppView, loadAppViewComponent } from "@/lib/lazy-registry";
import { ROUTES } from "@/constants/routes";
import { useWorkspaceStore } from "@/stores/platform/workspaceStore";

const SKELETON_DELAY_MS = 120;

// Static component - không cần recreate mỗi render
export const AppSkeleton = memo(function AppSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "50vh",
        color: "var(--color-foreground-muted)",
      }}
    >
      <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
    </div>
  );
});

// Error view — app registered in FE but its screen module failed to load.
const AppNotAvailable = memo(function AppNotAvailable({ appId }: { appId: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "50vh",
        gap: "0.5rem",
        color: "var(--color-foreground-muted)",
      }}
    >
      <Construction size={48} style={{ color: "var(--color-foreground-muted)" }} />
      <p>
        App <strong>"{appId}"</strong> is not available.
      </p>
    </div>
  );
});

// Not-installed view — app exists in catalog but is NOT installed for this workspace.
// User is NOT silently redirected; they see a clear message with a link to the store.
export const AppNotInstalled = memo(function AppNotInstalled({
  appId,
  appName,
}: {
  appId: string;
  appName: string | null;
}) {
  return (
    <div
      data-testid="not-installed-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "50vh",
        gap: "1rem",
        color: "var(--color-foreground-muted)",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          background: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px oklch(0 0 0 / 0.25)",
        }}
      >
        <Download size={28} />
      </div>
      <div>
        <h2
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--color-foreground)",
            margin: "0 0 0.5rem",
          }}
        >
          {appName ?? appId} is not installed
        </h2>
        <p
          style={{
            color: "var(--color-foreground-muted)",
            margin: 0,
            maxWidth: "24rem",
            lineHeight: 1.6,
          }}
        >
          This app has not been activated for your workspace.
          Visit the App Store to install it.
        </p>
      </div>
      <Link
        to={ROUTES.STORE}
        data-testid="not-installed-store-btn"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 1.25rem",
          borderRadius: "8px",
          background: "var(--color-primary)",
          color: "white",
          fontWeight: 600,
          fontSize: "0.875rem",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 2px 8px oklch(0 0 0 / 0.2)",
          textDecoration: "none",
        }}
      >
        <Download size={16} />
        Browse App Store
      </Link>
    </div>
  );
});

export default function AppPage() {
  const { appId } = useParams<{ appId: string }>();
  const { installedAppIds, isWorkspaceLoading } = useWorkspaceStore(
    useShallow((state) => ({
      installedAppIds: state.installedAppIds,
      isWorkspaceLoading: state.isWorkspaceLoading,
    }))
  );
  const [loadedComponent, setLoadedComponent] = useState<ComponentType | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const appMetadata = appId ? getAppMetadata(appId) : null;
  const isAppInstalled = appId ? installedAppIds.has(appId) : false;
  const canLoadApp = Boolean(appId) && !isWorkspaceLoading && isAppInstalled && Boolean(appMetadata);

  useEffect(() => {
    if (!canLoadApp || !appId) {
      setLoadedComponent(null);
      setHasLoadError(false);
      setShowSkeleton(false);
      return;
    }

    let cancelled = false;
    const cached = getLoadedAppView(appId);
    setLoadedComponent(() => cached);
    setHasLoadError(false);
    setShowSkeleton(false);

    if (cached) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setShowSkeleton(true);
      }
    }, SKELETON_DELAY_MS);

    void loadAppViewComponent(appId).then((component) => {
      if (cancelled) {
        return;
      }
      if (!component) {
        setHasLoadError(true);
        return;
      }
      setLoadedComponent(() => component);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [appId, canLoadApp]);

  if (!appId) return null; // Will be caught by route-level redirect
  if (isWorkspaceLoading) return <AppSkeleton />;
  if (!isAppInstalled) return <AppNotInstalled appId={appId} appName={appMetadata?.name ?? null} />;
  if (!appMetadata || hasLoadError) return <AppNotAvailable appId={appId} />;

  if (loadedComponent) {
    const LoadedComponent = loadedComponent;
    return <LoadedComponent />;
  }

  if (showSkeleton) {
    return <AppSkeleton />;
  }

  return <div style={{ minHeight: "50vh" }} />;
}

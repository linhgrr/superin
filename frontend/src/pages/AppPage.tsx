/**
 * AppPage — /apps/:appId — full app experience page.
 *
 * Renders app-specific layout by delegating to app sub-components.
 * Lazy loads app components on demand.
 * Delays skeleton briefly to avoid flashing on fast cached navigations.
 */

import { memo, useEffect, useState, type ComponentType } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Construction, Loader2 } from "lucide-react";
import { getAppMetadata, getLoadedAppView, loadAppViewComponent } from "@/lib/lazy-registry";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ROUTES } from "@/constants";

const SKELETON_DELAY_MS = 120;

// Static component - không cần recreate mỗi render
const AppSkeleton = memo(function AppSkeleton() {
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

// Error view - static component
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

export default function AppPage() {
  const { appId } = useParams<{ appId: string }>();
  const { installedAppIds, isWorkspaceLoading } = useWorkspace();
  const [loadedComponent, setLoadedComponent] = useState<ComponentType | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const appMetadata = appId ? getAppMetadata(appId) : null;
  const canLoadApp = Boolean(appId) && !isWorkspaceLoading && installedAppIds.has(appId) && Boolean(appMetadata);

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

  if (!appId) return <Navigate to={ROUTES.DASHBOARD} replace />;
  if (isWorkspaceLoading) return <AppSkeleton />;
  if (!installedAppIds.has(appId)) return <Navigate to={ROUTES.DASHBOARD} replace />;
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

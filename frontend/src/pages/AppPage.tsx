/**
 * AppPage — /apps/:appId — full app experience page.
 *
 * Renders app-specific layout by delegating to app sub-components.
 * Lazy loads app components on demand.
 * Kiểm tra nếu đã prefetch thì render trực tiếp, không qua Suspense.
 */

import { Suspense, memo } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Construction, Loader2 } from "lucide-react";
import { getLazyApp, isAppViewLoaded, getLoadedAppView } from "@/apps";

// Static component - không cần recreate mỗi render
const AppSkeleton = memo(function AppSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "50vh",
        color: "var(--color-muted)",
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
        color: "var(--color-muted)",
      }}
    >
      <Construction size={48} style={{ color: "var(--color-muted)" }} />
      <p>
        App <strong>"{appId}"</strong> is not available.
      </p>
    </div>
  );
});

export default function AppPage() {
  const { appId } = useParams<{ appId: string }>();

  if (!appId) return <Navigate to="/dashboard" replace />;

  // Kiểm tra nếu component đã được prefetch
  const isPrefetched = isAppViewLoaded(appId);

  // Nếu đã prefetch, render trực tiếp component
  if (isPrefetched) {
    const LoadedComponent = getLoadedAppView(appId);
    if (LoadedComponent) {
      return <LoadedComponent />;
    }
  }

  // Chưa prefetch - dùng lazy loading
  const lazyApp = getLazyApp(appId);
  const AppView = lazyApp?.AppView;

  if (!AppView) {
    return <AppNotAvailable appId={appId} />;
  }

  return (
    <Suspense key={appId} fallback={<AppSkeleton />}>
      <AppView />
    </Suspense>
  );
}

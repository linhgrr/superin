/**
 * LazyWidget - Lazy load widget component with a small skeleton delay
 * to avoid flicker when the chunk is already warm in browser cache.
 */

import { memo, useEffect, useState, type ComponentType } from "react";
import { getAppMetadata, getLoadedWidget, loadDashboardWidgetComponent } from "@/lib/lazy-registry";
import type { WidgetManifestSchema } from "@/types/generated";
import WidgetSkeleton from "./WidgetSkeleton";

const SKELETON_DELAY_MS = 120;

interface LazyWidgetProps {
  appId: string;
  widgetId: string;
  widget: WidgetManifestSchema;
  fallback?: React.ReactNode;
}

// Static skeleton component
const StaticWidgetSkeleton = memo(function StaticWidgetSkeleton({ size }: { size: string }) {
  return <WidgetSkeleton size={size} />;
});

export default function LazyWidget({
  appId,
  widgetId,
  widget,
  fallback,
}: LazyWidgetProps) {
  const [loadedComponent, setLoadedComponent] = useState<ComponentType<LazyWidgetProps> | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const appMetadata = getAppMetadata(appId);

  useEffect(() => {
    if (!appMetadata) {
      setLoadedComponent(null);
      setHasLoadError(false);
      setShowSkeleton(false);
      return;
    }

    let cancelled = false;
    const cached = getLoadedWidget(appId);
    setLoadedComponent(() => cached as ComponentType<LazyWidgetProps> | null);
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

    void loadDashboardWidgetComponent(appId).then((component) => {
      if (cancelled) {
        return;
      }
      if (!component) {
        setHasLoadError(true);
        return;
      }
      setLoadedComponent(() => component as ComponentType<LazyWidgetProps>);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [appId, appMetadata]);

  if (!appMetadata || hasLoadError) {
    return (
      <div style={{ padding: "1rem", color: "var(--color-foreground-muted)" }}>
        Widget not available
      </div>
    );
  }

  const skeleton = fallback ?? <StaticWidgetSkeleton size={widget.size} />;

  if (loadedComponent) {
    const LoadedComponent = loadedComponent;
    return <LoadedComponent appId={appId} widgetId={widgetId} widget={widget} />;
  }

  return showSkeleton ? skeleton : null;
}

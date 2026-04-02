/**
 * LazyWidget - Lazy load widget component voi Suspense
 */

import { Suspense, useMemo } from "react";
import { lazyLoadDashboardWidget } from "@/apps";
import type { AppCatalogEntry } from "@/types/generated/api";
import WidgetSkeleton from "./WidgetSkeleton";

interface LazyWidgetProps {
  appId: string;
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
  fallback?: React.ReactNode;
}

export default function LazyWidget({
  appId,
  widgetId,
  widget,
  fallback,
}: LazyWidgetProps) {
  // Memoize de tranh recreate lazy component moi render
  const LazyComponent = useMemo(() => {
    return lazyLoadDashboardWidget(appId);
  }, [appId]);

  if (!LazyComponent) {
    return (
      <div style={{ padding: "1rem", color: "var(--color-foreground-muted)" }}>
        Widget not available
      </div>
    );
  }

  const skeleton = fallback ?? <WidgetSkeleton size={widget.size} />;

  return (
    <Suspense fallback={skeleton}>
      <LazyComponent widgetId={widgetId} widget={widget} />
    </Suspense>
  );
}

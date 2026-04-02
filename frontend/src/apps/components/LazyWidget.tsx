/**
 * LazyWidget - Lazy load widget component với Suspense
 * Kiểm tra nếu đã prefetch thì render trực tiếp, không qua Suspense.
 */

import { Suspense, memo } from "react";
import { lazyLoadDashboardWidget, isWidgetLoaded, getLoadedWidget } from "@/apps";
import type { AppCatalogEntry } from "@/types/generated/api";
import WidgetSkeleton from "./WidgetSkeleton";

interface LazyWidgetProps {
  appId: string;
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
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
  // Kiểm tra nếu widget đã được prefetch
  const isPrefetched = isWidgetLoaded(appId);

  // Nếu đã prefetch, render trực tiếp component
  if (isPrefetched) {
    const LoadedComponent = getLoadedWidget(appId);
    if (LoadedComponent) {
      return <LoadedComponent widgetId={widgetId} widget={widget} />;
    }
  }

  // Chưa prefetch - dùng lazy loading
  const LazyComponent = lazyLoadDashboardWidget(appId);

  if (!LazyComponent) {
    return (
      <div style={{ padding: "1rem", color: "var(--color-foreground-muted)" }}>
        Widget not available
      </div>
    );
  }

  const skeleton = fallback ?? <StaticWidgetSkeleton size={widget.size} />;

  return (
    <Suspense fallback={skeleton}>
      <LazyComponent widgetId={widgetId} widget={widget} />
    </Suspense>
  );
}

/**
 * DashboardGrid — renders the responsive draggable widget grid.
 * Consumes useWidgetPreferences for all state and handlers.
 */

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import type { AppRuntimeEntry, PreferenceUpdate, WidgetPreferenceSchema } from "@/types/generated";

import { DashboardActionBar, DashboardGridContent } from "./DashboardGridSections";
import { useWidgetPreferences } from "./useWidgetPreferences";

interface DashboardGridProps {
  installedApps: AppRuntimeEntry[];
  workspacePreferences: WidgetPreferenceSchema[];
  onCommit: (updates: PreferenceUpdate[]) => void;
}

export default function DashboardGrid({
  installedApps,
  workspacePreferences,
  onCommit,
}: DashboardGridProps) {
  const {
    containerRef,
    containerWidth,
    enabledWidgetIds,
    visibleWidgets,
    responsiveLayouts,
    busyWidgetId,
    handleLayoutChange,
    handleLayoutCommit,
    handleWidgetVisibilityChange,
    handleAutoRearrange,
  } = useWidgetPreferences({ installedApps, workspacePreferences, onCommit });

  return (
    <div ref={containerRef} style={{ animation: "fadeIn 0.4s ease" }}>
      <DashboardActionBar
        installedApps={installedApps}
        enabledWidgetIds={enabledWidgetIds}
        busyWidgetId={busyWidgetId}
        onAutoArrange={() => handleAutoRearrange(visibleWidgets)}
        onToggleWidget={handleWidgetVisibilityChange}
      />
      <DashboardGridContent
        containerWidth={containerWidth}
        visibleWidgets={visibleWidgets}
        responsiveLayouts={responsiveLayouts}
        onLayoutChange={handleLayoutChange}
        onLayoutCommit={handleLayoutCommit}
      />
    </div>
  );
}

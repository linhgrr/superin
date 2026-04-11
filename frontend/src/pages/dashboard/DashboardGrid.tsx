/**
 * DashboardGrid — renders the responsive draggable widget grid.
 * Consumes useWidgetPreferences for all state and handlers.
 */

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useCallback, useState } from "react";
import { Responsive, verticalCompactor } from "react-grid-layout";

import { DynamicIcon } from "@/lib/icon-resolver";
import AddWidgetDialog from "@/components/dashboard/AddWidgetDialog";
import {
  useWidgetPreferences,
  GRID_COLS,
  GRID_BREAKPOINTS,
  ROW_HEIGHT,
} from "./useWidgetPreferences";
import WidgetCard from "./WidgetCard";
import LazyWidget from "@/components/LazyWidget";

interface DashboardGridProps {
  installedApps: import("@/types/generated").AppRuntimeEntry[];
  workspacePreferences: import("@/types/generated").WidgetPreferenceSchema[];
  onCommit: (updates: import("@/types/generated").PreferenceUpdate[]) => void;
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
      {/* Action bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => handleAutoRearrange(visibleWidgets)}
          aria-label="Auto arrange widgets"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <DynamicIcon name="LayoutGrid" size={16} />
          Auto Arrange
        </button>
        <AddWidgetButton
          installedApps={installedApps}
          enabledWidgetIds={enabledWidgetIds}
          busyWidgetId={busyWidgetId}
          onToggleWidget={handleWidgetVisibilityChange}
        />
      </div>

      {/* Grid */}
      <Responsive
        className="dashboard-grid-layout"
        layouts={responsiveLayouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        width={containerWidth}
        compactor={verticalCompactor}
        dragConfig={{ enabled: true }}
        resizeConfig={{ enabled: true, handles: ["se"] }}
        onLayoutChange={handleLayoutChange}
        onDragStop={handleLayoutCommit}
        onResizeStop={handleLayoutCommit}
        margin={[16, 16]}
        containerPadding={[0, 0]}
      >
        {visibleWidgets.map(({ widgetId, appId, widget }) => (
          <div key={widgetId} className="rgl-item-view">
            <WidgetCard widget={widget} widgetId={widgetId}>
              <LazyWidget appId={appId} widgetId={widgetId} widget={widget} />
            </WidgetCard>
          </div>
        ))}
      </Responsive>
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

interface AddWidgetButtonProps {
  installedApps: import("@/types/generated").AppRuntimeEntry[];
  enabledWidgetIds: Set<string>;
  busyWidgetId: string | null;
  onToggleWidget: (widgetId: string, enabled: boolean) => void;
}

function AddWidgetButton({
  installedApps,
  enabledWidgetIds,
  busyWidgetId,
  onToggleWidget,
}: AddWidgetButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={open}
        aria-label="Add widget"
        style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
      >
        <DynamicIcon name="Plus" size={16} />
        Add Widget
      </button>
      {isOpen && (
        <AddWidgetDialog
          catalog={installedApps}
          enabledWidgetIds={enabledWidgetIds}
          busyWidgetId={busyWidgetId}
          onToggleWidget={onToggleWidget}
          onClose={close}
        />
      )}
    </>
  );
}

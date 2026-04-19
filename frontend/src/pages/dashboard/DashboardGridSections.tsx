import type { ReactNode } from "react";

import { Responsive } from "react-grid-layout";

import LazyWidget from "@/components/LazyWidget";
import AddWidgetDialog from "@/components/dashboard/AddWidgetDialog";
import { DynamicIcon } from "@/lib/icon-resolver";
import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";
import type { AppRuntimeEntry, PreferenceUpdate, WidgetPreferenceSchema } from "@/types/generated";

import { getSizeConfig } from "./layout-engine";
import { GRID_BREAKPOINTS, GRID_COLS, ROW_HEIGHT } from "./useWidgetPreferences";
import WidgetCard from "./WidgetCard";

interface VisibleWidget {
  appId: string;
  widget: AppRuntimeEntry["widgets"][number];
  widgetId: string;
}

interface DashboardActionBarProps {
  busyWidgetId: string | null;
  enabledWidgetIds: Set<string>;
  installedApps: AppRuntimeEntry[];
  onAutoArrange: () => void;
  onToggleWidget: (widgetId: string, enabled: boolean) => void;
}

interface DashboardGridContentProps {
  containerWidth: number;
  onLayoutChange: (currentLayout: unknown, allLayouts: unknown) => void;
  onLayoutCommit: (
    currentLayout: unknown,
    oldItem: unknown,
    newItem: unknown,
    placeholder: unknown,
    event: MouseEvent,
    element: HTMLElement,
  ) => void;
  responsiveLayouts: Record<string, unknown[]>;
  visibleWidgets: VisibleWidget[];
}

const MOBILE_BREAKPOINT = 1024;
const DEFAULT_AUTO_HEIGHT = "200px";

export function DashboardActionBar({
  busyWidgetId,
  enabledWidgetIds,
  installedApps,
  onAutoArrange,
  onToggleWidget,
}: DashboardActionBarProps) {
  return (
    <div className="dashboard-action-bar">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onAutoArrange}
        aria-label="Auto arrange widgets"
      >
        <span className="btn-auto-arrange-content">
          <DynamicIcon name="LayoutGrid" size={16} />
          Auto Arrange
        </span>
      </button>
      <AddWidgetButton
        installedApps={installedApps}
        enabledWidgetIds={enabledWidgetIds}
        busyWidgetId={busyWidgetId}
        onToggleWidget={onToggleWidget}
      />
    </div>
  );
}

export function DashboardGridContent({
  containerWidth,
  onLayoutChange,
  onLayoutCommit,
  responsiveLayouts,
  visibleWidgets,
}: DashboardGridContentProps) {
  const isMobileLayout = containerWidth <= MOBILE_BREAKPOINT;

  if (isMobileLayout) {
    return (
      <div className="dashboard-mobile-layout">
        {visibleWidgets.map((item) => (
          <MobileWidgetCard key={item.widgetId} item={item} />
        ))}
      </div>
    );
  }

  return (
    <Responsive
      className="dashboard-grid-layout"
      layouts={responsiveLayouts as never}
      breakpoints={GRID_BREAKPOINTS}
      cols={GRID_COLS}
      rowHeight={ROW_HEIGHT}
      width={containerWidth}
      compactType="vertical"
      useCSSTransforms={true}
      preventCollision={false}
      dragConfig={{ enabled: true, threshold: 3 }}
      resizeConfig={{ enabled: true, handles: ["se", "s", "e"] }}
      onLayoutChange={onLayoutChange as never}
      onDragStop={onLayoutCommit as never}
      onResizeStop={onLayoutCommit as never}
      margin={[16, 16]}
      containerPadding={[0, 0]}
    >
      {visibleWidgets.map((item) => (
        <div key={item.widgetId} className="rgl-item-view">
          <DashboardWidgetCard item={item} />
        </div>
      ))}
    </Responsive>
  );
}

function AddWidgetButton({
  installedApps,
  enabledWidgetIds,
  busyWidgetId,
  onToggleWidget,
}: {
  installedApps: AppRuntimeEntry[];
  enabledWidgetIds: Set<string>;
  busyWidgetId: string | null;
  onToggleWidget: (widgetId: string, enabled: boolean) => void;
}) {
  const isOpen = usePlatformUiStore(platformUiSelectors.isAddWidgetDialogOpen);
  const openDialog = usePlatformUiStore(platformUiSelectors.openAddWidgetDialog);
  const closeDialog = usePlatformUiStore(platformUiSelectors.closeAddWidgetDialog);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={openDialog}
        aria-label="Add widget"
        style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
      >
        <DynamicIcon name="Plus" size={16} />
        Add Widget
      </button>
      {isOpen ? (
        <AddWidgetDialog
          catalog={installedApps}
          enabledWidgetIds={enabledWidgetIds}
          busyWidgetId={busyWidgetId}
          onToggleWidget={onToggleWidget}
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}

function MobileWidgetCard({ item }: { item: VisibleWidget }) {
  const config = getSizeConfig(item.widget.size);
  const minHeight = config.height === "auto" ? DEFAULT_AUTO_HEIGHT : config.height;

  return (
    <div className="mobile-widget-wrapper" style={{ minHeight }}>
      <DashboardWidgetCard item={item} />
    </div>
  );
}

function DashboardWidgetCard({ item }: { item: VisibleWidget }) {
  return (
    <WidgetCard widget={item.widget} widgetId={item.widgetId}>
      <LazyWidget appId={item.appId} widgetId={item.widgetId} widget={item.widget} />
    </WidgetCard>
  );
}

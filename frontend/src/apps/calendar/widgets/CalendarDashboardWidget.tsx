import type { ComponentType } from "react";
import type { DashboardWidgetProps, DashboardWidgetRendererProps } from "../types";
import MonthViewWidget from "./MonthViewWidget";
import UpcomingWidget from "./UpcomingWidget";
import DaySummaryWidget from "./DaySummaryWidget";

const WIDGET_COMPONENTS = {
  "calendar.month-view": (_props: DashboardWidgetRendererProps) => <MonthViewWidget />,
  "calendar.upcoming": (_props: DashboardWidgetRendererProps) => <UpcomingWidget />,
  "calendar.day-summary": DaySummaryWidget,
} as const satisfies Record<string, ComponentType<DashboardWidgetRendererProps>>;

export default function CalendarDashboardWidget({ widgetId, widget }: DashboardWidgetProps) {
  const Component = WIDGET_COMPONENTS[widgetId as keyof typeof WIDGET_COMPONENTS];

  if (Component) {
    return <Component widget={widget} />;
  }

  return (
    <div>
      <p className="section-label">{widget.name}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", margin: "0.25rem 0 0" }}>
        {widget.description}
      </p>
    </div>
  );
}

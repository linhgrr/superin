import type { ComponentType } from "react";
import type { DashboardWidgetProps, DashboardWidgetRendererProps } from "../types";
import TaskListWidget from "./TaskListWidget";
import TodayWidget from "./TodayWidget";

const WIDGET_COMPONENTS = {
  "todo.task-list": TaskListWidget,
  "todo.today": TodayWidget,
} as const satisfies Record<string, ComponentType<DashboardWidgetRendererProps>>;

export default function TodoDashboardWidget({ widgetId, widget }: DashboardWidgetProps) {
  const Component = WIDGET_COMPONENTS[widgetId as keyof typeof WIDGET_COMPONENTS];

  if (Component) {
    return <Component widget={widget} />;
  }

  return (
    <div>
      <p className="section-label">{widget.name}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
        {widget.description}
      </p>
    </div>
  );
}

import type { ComponentType } from "react";
import type { DashboardWidgetProps, DashboardWidgetRendererProps } from "../types";
import TaskListWidget from "./TaskListWidget";
import TodayWidget from "./TodayWidget";

const TODO_WIDGETS = {
  "todo.task-list": TaskListWidget,
  "todo.task-count": TaskListWidget,
  "todo.summary": TaskListWidget,
  "todo.today": TodayWidget,
} as const satisfies Record<string, ComponentType<DashboardWidgetRendererProps>>;

export default function TodoDashboardWidget({ widgetId, widget }: DashboardWidgetProps) {
  const Component = TODO_WIDGETS[widgetId as keyof typeof TODO_WIDGETS];

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

import type { DashboardWidgetComponentMap, DashboardWidgetProps } from "@/lib/types";

export function createDashboardWidgetRenderer(widgetComponents: DashboardWidgetComponentMap) {
  return function DashboardWidget({ widgetId, widget }: DashboardWidgetProps) {
    const Component = widgetComponents[widgetId];

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
  };
}

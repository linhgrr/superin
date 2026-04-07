import type { ComponentType } from "react";
import type { DashboardWidgetProps, DashboardWidgetRendererProps } from "../types";
import TotalBalanceWidget from "./TotalBalanceWidget";
import BudgetOverviewWidget from "./BudgetOverviewWidget";
import RecentTransactionsWidget from "./RecentTransactionsWidget";

const WIDGET_COMPONENTS = {
  "finance.total-balance": TotalBalanceWidget,
  "finance.budget-overview": BudgetOverviewWidget,
  "finance.recent-transactions": RecentTransactionsWidget,
} as const satisfies Record<string, ComponentType<DashboardWidgetRendererProps>>;

export default function FinanceDashboardWidget(props: DashboardWidgetProps) {
  const { widgetId, widget } = props;
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

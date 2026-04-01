import type { ComponentType } from "react";
import type { DashboardWidgetProps, DashboardWidgetRendererProps } from "../types";
import BudgetOverviewWidget from "./BudgetOverviewWidget";
import RecentTransactionsWidget from "./RecentTransactionsWidget";
import TotalBalanceWidget from "./TotalBalanceWidget";

const FINANCE_WIDGETS = {
  "finance.total-balance": TotalBalanceWidget,
  "finance.balance-summary": TotalBalanceWidget,
  "finance.budget-overview": BudgetOverviewWidget,
  "finance.recent-transactions": RecentTransactionsWidget,
} as const satisfies Record<string, ComponentType<DashboardWidgetRendererProps>>;

export default function FinanceDashboardWidget({ widgetId, widget }: DashboardWidgetProps) {
  const Component = FINANCE_WIDGETS[widgetId as keyof typeof FINANCE_WIDGETS];

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

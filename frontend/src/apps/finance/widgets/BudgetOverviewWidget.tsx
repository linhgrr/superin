import type { DashboardWidgetRendererProps } from "../types";

import WidgetState from "@/components/feedback/WidgetState";
import { getWidgetData, type BudgetOverviewWidgetData } from "../api";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useWidgetData } from "@/lib/widget-data";

export default function BudgetOverviewWidget({ widget }: DashboardWidgetRendererProps) {
  const { data, error, isLoading, mutate } = useWidgetData<BudgetOverviewWidgetData>(
    "finance",
    widget.id,
    () => getWidgetData(widget.id) as Promise<BudgetOverviewWidgetData>
  );

  if (isLoading) {
    return (
      <WidgetState
        variant="loading"
        title="Loading budget overview"
        description="Fetching this month's tracked budget summary."
      />
    );
  }

  if (error) {
    return (
      <WidgetState
        variant="error"
        title="Could not load budget overview"
        description={error instanceof Error ? error.message : "Please try again."}
        onRetry={() => {
          void mutate();
        }}
      />
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "var(--color-warning-muted, oklch(0.75 0.18 75 / 0.15))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-warning)",
            flexShrink: 0,
          }}
        >
          <DynamicIcon name="Receipt" size={20} />
        </div>
        <div>
          <div className="stat-value" style={{ color: "var(--color-foreground)", fontSize: "1.75rem" }}>
            {data?.over_budget_count ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginTop: "0.125rem" }}>
            {data?.remaining_budget != null
              ? `${Math.max(data.remaining_budget, 0).toLocaleString()} left this month`
              : "Tracked budgets this month"}
          </div>
        </div>
      </div>
    </div>
  );
}

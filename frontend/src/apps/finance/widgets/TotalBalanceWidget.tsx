import type { DashboardWidgetRendererProps } from "../types";
import { formatCurrency } from "../lib/formatCurrency";
import { useFinanceSummary } from "./useFinanceSummary";

export default function TotalBalanceWidget({ widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useFinanceSummary();

  return (
    <div>
      <p className="section-label">{widget.name}</p>
      {loading ? (
        <div className="stat-value" style={{ color: "var(--color-muted)" }}>—</div>
      ) : (
        <div className="stat-value" style={{ color: "var(--color-foreground)" }}>
          {formatCurrency(summary?.total_balance ?? 0)}
        </div>
      )}
    </div>
  );
}

import type { DashboardWidgetRendererProps } from "../types";
import { formatCurrency } from "../lib/formatCurrency";
import { useFinanceSummary } from "./useFinanceSummary";

export default function RecentTransactionsWidget({ widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useFinanceSummary();

  return (
    <div>
      <p className="section-label">{widget.name}</p>
      {loading ? (
        <div style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>Loading…</div>
      ) : (
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--color-success)" }}>↑ Income</span>
            <span className="amount-positive">
              {formatCurrency(summary?.income_this_month ?? 0)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--color-danger)" }}>↓ Expenses</span>
            <span className="amount-negative">
              {formatCurrency(summary?.expense_this_month ?? 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

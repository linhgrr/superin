import type { DashboardWidgetRendererProps } from "../types";
import { useFinanceSummary } from "./useFinanceSummary";

export default function QuickStatsWidget({ widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useFinanceSummary();

  return (
    <div>
      <p className="section-label">{widget.name}</p>
      {loading ? (
        <div style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>Loading…</div>
      ) : (
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--color-muted)" }}>
          {summary?.transaction_count ?? 0} transactions this month
        </div>
      )}
    </div>
  );
}

import type { DashboardWidgetRendererProps } from "../types";
import { useFinanceSummary } from "./useFinanceSummary";
import { Receipt } from "lucide-react";

export default function BudgetOverviewWidget({ widget: _widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useFinanceSummary();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {loading ? (
        <div style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>Loading…</div>
      ) : (
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
            <Receipt size={20} />
          </div>
          <div>
            <div className="stat-value" style={{ color: "var(--color-foreground)", fontSize: "1.75rem" }}>
              {summary?.transaction_count ?? 0}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.125rem" }}>
              Transactions this month
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

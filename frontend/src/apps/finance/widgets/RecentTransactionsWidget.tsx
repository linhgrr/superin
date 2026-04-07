import type { DashboardWidgetRendererProps } from "../types";
import { formatCurrency } from "../lib/formatCurrency";
import { useFinanceSummary } from "./useFinanceSummary";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function RecentTransactionsWidget({ widget: _widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useFinanceSummary();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {loading ? (
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", gap: "1rem" }}>
          {/* Income */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--color-success-muted, oklch(0.72 0.19 145 / 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-success)",
                flexShrink: 0,
              }}
            >
              <ArrowUpRight size={16} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-foreground-muted)", textTransform: "uppercase" }}>
                Income
              </div>
              <div className="amount-positive" style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
                {formatCurrency(summary?.income_this_month ?? 0)}
              </div>
            </div>
          </div>

          {/* Expense */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--color-danger-muted, oklch(0.63 0.24 25 / 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-danger)",
                flexShrink: 0,
              }}
            >
              <ArrowDownRight size={16} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-foreground-muted)", textTransform: "uppercase" }}>
                Expense
              </div>
              <div className="amount-negative" style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
                {formatCurrency(summary?.expense_this_month ?? 0)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

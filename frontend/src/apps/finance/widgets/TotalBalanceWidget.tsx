import type { DashboardWidgetRendererProps } from "../types";
import { formatCurrency } from "../lib/formatCurrency";
import { useFinanceSummary } from "./useFinanceSummary";
import { Wallet } from "lucide-react";

export default function TotalBalanceWidget({ widget: _widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useFinanceSummary();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {loading ? (
        <div className="stat-value" style={{ color: "var(--color-muted)" }}>—</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--color-primary-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
              flexShrink: 0,
            }}
          >
            <Wallet size={20} />
          </div>
          <div>
            <div className="stat-value" style={{ color: "var(--color-foreground)", fontSize: "1.75rem" }}>
              {formatCurrency(summary?.total_balance ?? 0)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.125rem" }}>
              Available balance
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

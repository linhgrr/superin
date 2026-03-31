/**
 * FinanceWidget — renders a finance widget on the dashboard.
 * Renders different content based on widget ID.
 */

import { useEffect, useState } from "react";
import { getFinanceSummary } from "./api";
import type { AppCatalogEntry } from "@/types/generated/api";

interface Props {
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
}

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FinanceWidget({ widgetId, widget }: Props) {
  const [summary, setSummary] = useState<{
    total_balance: number;
    income_this_month: number;
    expense_this_month: number;
    transaction_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFinanceSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (widgetId === "finance.total-balance" || widgetId === "finance.balance-summary") {
    return (
      <div>
        <p className="section-label">Total Balance</p>
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

  if (widgetId === "finance.recent-transactions") {
    return (
      <div>
        <p className="section-label">This Month</p>
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

  if (widgetId === "finance.quick-stats") {
    return (
      <div>
        <p className="section-label">Quick Stats</p>
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

  // Fallback
  return (
    <div>
      <p className="section-label">{widget.name}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
        {widget.description}
      </p>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";

import { DynamicIcon } from "@/lib/icon-resolver";

import type { MonthlyTrendResponse } from "../api";
import { getMonthlyTrend } from "../api";
import FinancePanelState from "./FinancePanelState";

interface MonthlyTrendChartProps {
  months?: number;
}

export default function MonthlyTrendChart({ months = 6 }: MonthlyTrendChartProps) {
  const [data, setData] = useState<MonthlyTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMonthlyTrend({ months });
      setData(result);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Unable to load trend data");
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <FinancePanelState
        variant="loading"
        title="Loading trend data"
        description="Fetching recent income and expense performance."
      />
    );
  }

  if (error) {
    return (
      <FinancePanelState
        variant="error"
        title="Could not load monthly trend"
        description={error}
        onRetry={() => {
          void loadData();
        }}
      />
    );
  }

  const monthData = data?.trend ?? [];

  if (!data || monthData.length === 0) {
    return (
      <FinancePanelState
        variant="empty"
        title="No trend data yet"
        description="Add some transactions to start seeing monthly income and expense trends."
      />
    );
  }

  const maxValue = Math.max(...monthData.map((m) => Math.max(m.income ?? 0, m.expense ?? 0)), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", fontSize: "0.75rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--color-success)" }}>
          <DynamicIcon name="TrendingUp" size={12} /> Income
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--color-danger)" }}>
          <DynamicIcon name="TrendingDown" size={12} /> Expense
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--color-primary)" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} /> Net
        </span>
      </div>

      {/* Chart */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "0.75rem",
          height: "180px",
          padding: "0.5rem",
          background: "var(--color-surface-elevated)",
          borderRadius: "0.5rem",
        }}
      >
        {monthData.map((month) => {
          const incomeHeight = (month.income / maxValue) * 100;
          const expenseHeight = (month.expense / maxValue) * 100;
          const netPositive = month.net >= 0;

          return (
            <div
              key={`${month.year}-${month.month}`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                minWidth: "50px",
              }}
              title={`${month.month}/${month.year}: Income ${month.income.toLocaleString()}, Expense ${month.expense.toLocaleString()}, Net ${month.net.toLocaleString()}`}
            >
              {/* Income bar */}
              <div
                style={{
                  width: "100%",
                  height: `${incomeHeight}%`,
                  minHeight: "2px",
                  background: "var(--color-success)",
                  borderRadius: "2px",
                  opacity: 0.7,
                }}
              />
              {/* Net indicator */}
              <div
                style={{
                  width: "100%",
                  height: "4px",
                  background: netPositive ? "var(--color-primary)" : "var(--color-danger)",
                  borderRadius: "2px",
                }}
              />
              {/* Expense bar */}
              <div
                style={{
                  width: "100%",
                  height: `${expenseHeight}%`,
                  minHeight: "2px",
                  background: "var(--color-danger)",
                  borderRadius: "2px",
                  opacity: 0.7,
                }}
              />

              <div
                style={{
                  fontSize: "0.625rem",
                  color: "var(--color-foreground-muted)",
                  textAlign: "center",
                  marginTop: "0.25rem",
                }}
              >
                {String(month.month).padStart(2, "0")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          justifyContent: "center",
          fontSize: "0.875rem",
          padding: "0.75rem",
          background: "var(--color-surface)",
          borderRadius: "0.5rem",
        }}
      >
        {(() => {
          const totalIncome = monthData.reduce((sum, m) => sum + m.income, 0);
          const totalExpense = monthData.reduce((sum, m) => sum + m.expense, 0);
          const totalNet = totalIncome - totalExpense;

          return (
            <>
              <span style={{ color: "var(--color-success)" }}>+{totalIncome.toLocaleString()}</span>
              <span style={{ color: "var(--color-foreground-muted)" }}>/</span>
              <span style={{ color: "var(--color-danger)" }}>-{totalExpense.toLocaleString()}</span>
              <span style={{ color: "var(--color-foreground-muted)" }}>=</span>
              <span style={{ color: totalNet >= 0 ? "var(--color-primary)" : "var(--color-danger)" }}>
                {totalNet >= 0 ? "+" : ""}
                {totalNet.toLocaleString()}
              </span>
            </>
          );
        })()}
      </div>
    </div>
  );
}

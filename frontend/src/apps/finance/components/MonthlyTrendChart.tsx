import { useState, useEffect } from "react";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import type { MonthlyTrendResponse } from "../api";
import { getMonthlyTrend } from "../api";

interface MonthlyTrendChartProps {
  months?: number;
}

export default function MonthlyTrendChart({ months = 6 }: MonthlyTrendChartProps) {
  const [data, setData] = useState<MonthlyTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await getMonthlyTrend(months);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [months]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--color-foreground-muted)" }} />
      </div>
    );
  }

  if (error || !data || !data.months || data.months.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
        {error || "No trend data available"}
      </div>
    );
  }

  const monthData = data?.months ?? [];
  if (monthData.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
        No trend data available
      </div>
    );
  }

  const maxValue = Math.max(...monthData.map((m) => Math.max(m.income ?? 0, m.expense ?? 0)), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", fontSize: "0.75rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--color-success)" }}>
          <TrendingUp size={12} /> Income
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--color-danger)" }}>
          <TrendingDown size={12} /> Expense
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
              key={month.month}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                minWidth: "50px",
              }}
              title={`${month.month} ${month.year}: Income ${month.income.toLocaleString()}, Expense ${month.expense.toLocaleString()}, Net ${month.net.toLocaleString()}`}
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
                {month.month.slice(0, 3)}
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

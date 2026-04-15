import { useCallback, useEffect, useState } from "react";

import type { CategoryBreakdownResponse } from "../api";
import { getCategoryBreakdown } from "../api";
import FinancePanelState from "./FinancePanelState";

interface CategoryBreakdownChartProps {
  month?: number;
  year?: number;
}

export default function CategoryBreakdownChart({ month, year }: CategoryBreakdownChartProps) {
  const [data, setData] = useState<CategoryBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCategoryBreakdown({ month, year });
      setData(result);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Unable to load category spending data");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <FinancePanelState
        variant="loading"
        title="Loading category breakdown"
        description="Calculating which categories drive your spending."
      />
    );
  }

  if (error) {
    return (
      <FinancePanelState
        variant="error"
        title="Could not load category breakdown"
        description={error}
        onRetry={() => {
          void loadData();
        }}
      />
    );
  }

  const categories = data?.breakdown ?? [];

  if (!data || categories.length === 0) {
    return (
      <FinancePanelState
        variant="empty"
        title="No spending breakdown yet"
        description="Add expense transactions to see how your spending is distributed across categories."
      />
    );
  }

  const total = data.total_spending;
  const maxAmount = Math.max(...categories.map((c) => c.amount ?? 0), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", textAlign: "center" }}>
        Total: <strong>{total.toLocaleString()}</strong> in {data.month}/{data.year}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "0.5rem",
          height: "200px",
          padding: "0.5rem",
          background: "var(--color-surface-elevated)",
          borderRadius: "0.5rem",
        }}
      >
        {categories.map((category) => {
          const heightPercent = maxAmount > 0 ? (category.amount / maxAmount) * 100 : 0;
          return (
            <div
              key={category.category}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                minWidth: "60px",
              }}
              title={`${category.category}: ${category.amount.toLocaleString()} (${category.percentage.toFixed(1)}%)`}
            >
              <div
                style={{
                  width: "100%",
                  height: `${heightPercent}%`,
                  minHeight: "4px",
                  background: "var(--color-primary)",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.3s ease",
                }}
              />
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-foreground-muted)",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {category.category}
              </div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-foreground-muted)" }}>
                {category.percentage.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

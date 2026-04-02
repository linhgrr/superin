import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { CategoryBreakdownResponse } from "../api";
import { getCategoryBreakdown } from "../api";

interface CategoryBreakdownChartProps {
  month?: number;
  year?: number;
}

export default function CategoryBreakdownChart({ month, year }: CategoryBreakdownChartProps) {
  const [data, setData] = useState<CategoryBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await getCategoryBreakdown(month, year);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [month, year]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--color-muted)" }} />
      </div>
    );
  }

  if (error || !data || !data.categories || data.categories.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-muted)" }}>
        {error || "No spending data available"}
      </div>
    );
  }

  const categories = data?.categories ?? [];
  const total = data?.total ?? 0;

  if (categories.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-muted)" }}>
        No spending data available
      </div>
    );
  }

  const maxAmount = Math.max(...categories.map((c) => c.amount ?? 0), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: "0.875rem", color: "var(--color-muted)", textAlign: "center" }}>
        Total: <strong>{total.toLocaleString()}</strong> in {month}/{year}
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
              key={category.category_id}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                minWidth: "60px",
              }}
              title={`${category.name}: ${category.amount.toLocaleString()} (${category.percentage.toFixed(1)}%)`}
            >
              <div
                style={{
                  width: "100%",
                  height: `${heightPercent}%`,
                  minHeight: "4px",
                  background: category.color || "var(--color-primary)",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.3s ease",
                }}
              />
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-muted)",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {category.name}
              </div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-muted)" }}>
                {category.percentage.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

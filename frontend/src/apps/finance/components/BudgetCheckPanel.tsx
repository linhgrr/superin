import { useState, useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { BudgetCheckResponse } from "../api";
import { checkBudget } from "../api";

interface BudgetCheckPanelProps {
  categoryId?: string;
}

export default function BudgetCheckPanel({ categoryId }: BudgetCheckPanelProps) {
  const [budgetData, setBudgetData] = useState<BudgetCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBudget() {
      try {
        const data = await checkBudget(categoryId);
        setBudgetData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load budget");
      } finally {
        setLoading(false);
      }
    }
    fetchBudget();
  }, [categoryId]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--color-foreground-muted)" }} />
      </div>
    );
  }

  if (error || !budgetData) {
    return (
      <div style={{ padding: "1rem", color: "var(--color-danger)", fontSize: "0.875rem" }}>
        {error || "Failed to load budget data"}
      </div>
    );
  }

  const categories = budgetData?.categories ?? [];
  const total_budget = budgetData?.total_budget ?? 0;
  const total_spent = budgetData?.total_spent ?? 0;

  if (categories.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
        No budget set. Create categories with budgets to track your spending.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Total Overview */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          padding: "1rem",
          background: "var(--color-surface-elevated)",
          borderRadius: "0.75rem",
          border: "1px solid var(--color-border)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginBottom: "0.25rem" }}>
            Total Budget
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {total_budget.toLocaleString()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginBottom: "0.25rem" }}>
            Total Spent
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: total_spent > total_budget ? "var(--color-danger)" : "var(--color-foreground)",
            }}
          >
            {total_spent.toLocaleString()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginBottom: "0.25rem" }}>
            Remaining
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: total_spent > total_budget ? "var(--color-danger)" : "var(--color-success)",
            }}
          >
            {(total_budget - total_spent).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {categories.map((category) => {
          const percentage = Math.min(category.percentage, 100);
          const isOver = category.is_over;

          return (
            <div
              key={category.category_id}
              style={{
                padding: "0.75rem",
                background: "var(--color-surface)",
                borderRadius: "0.5rem",
                border: "1px solid var(--color-border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 500 }}>{category.name}</span>
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      fontWeight: 600,
                      color: isOver ? "var(--color-danger)" : "var(--color-foreground)",
                    }}
                  >
                    {category.spent.toLocaleString()}
                  </span>
                  <span style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>
                    {" "}
                    / {category.budget.toLocaleString()}
                  </span>
                </div>
              </div>

              <div
                style={{
                  height: "8px",
                  background: "var(--color-surface-elevated)",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${percentage}%`,
                    height: "100%",
                    background: isOver ? "var(--color-danger)" : "var(--color-primary)",
                    borderRadius: "4px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
                  {Math.round(category.percentage)}%
                </span>
                {isOver && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.75rem",
                      color: "var(--color-danger)",
                      fontWeight: 500,
                    }}
                  >
                    <AlertCircle size={12} />
                    Over budget by {Math.abs(category.remaining).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

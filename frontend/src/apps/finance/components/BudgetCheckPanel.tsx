import { DynamicIcon } from "@/lib/icon-resolver";

import type { BudgetCategoryStatus, CheckBudgetResponse } from "../api";
import { useBudgetCheck } from "../hooks/useFinanceSwr";
import FinancePanelState from "./FinancePanelState";

interface BudgetCheckPanelProps {
  categoryId?: string;
}

export default function BudgetCheckPanel({ categoryId }: BudgetCheckPanelProps) {
  const { data: budgetData, error, isLoading } = useBudgetCheck(categoryId);

  if (isLoading) {
    return (
      <FinancePanelState
        variant="loading"
        title="Loading budget status"
        description="Checking how your spending compares to configured budgets."
      />
    );
  }

  if (error || !budgetData) {
    const message = error instanceof Error ? error.message : "Failed to load budget data";
    return (
      <FinancePanelState
        variant="error"
        title="Could not load budget overview"
        description={message}
      />
    );
  }

  const categories: BudgetCategoryStatus[] = isBudgetOverview(budgetData)
    ? budgetData.categories ?? []
    : [budgetData];
  const totalBudget = isBudgetOverview(budgetData)
    ? budgetData.total_budget
    : budgetData.budget;
  const totalSpent = isBudgetOverview(budgetData)
    ? budgetData.total_spent
    : budgetData.spent;

  if (categories.length === 0) {
    return (
      <FinancePanelState
        variant="empty"
        title="No budget tracking yet"
        description="Add category budgets to start tracking how much you have left to spend."
      />
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
            {totalBudget.toLocaleString()}
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
              color: totalSpent > totalBudget ? "var(--color-danger)" : "var(--color-foreground)",
            }}
          >
            {totalSpent.toLocaleString()}
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
              color: totalSpent > totalBudget ? "var(--color-danger)" : "var(--color-success)",
            }}
          >
            {(totalBudget - totalSpent).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {categories.map((category) => {
          const percentage = Math.min(category.percentage_used ?? 0, 100);
          const isOver = category.over_budget;

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
                <span style={{ fontWeight: 500 }}>{category.category_name}</span>
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
                  {Math.round(category.percentage_used ?? 0)}%
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
                    <DynamicIcon name="AlertCircle" size={12} />
                    Over budget by {Math.abs(category.remaining ?? 0).toLocaleString()}
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

function isBudgetOverview(data: CheckBudgetResponse): data is Extract<CheckBudgetResponse, { total_budget: number }> {
  return "total_budget" in data;
}

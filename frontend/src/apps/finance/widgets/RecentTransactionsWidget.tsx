import type { DashboardWidgetRendererProps } from "../types";

import { formatCurrency } from "../lib/formatCurrency";
import { getWidgetData, type RecentTransactionsWidgetData } from "../api";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useWidgetData } from "@/lib/widget-data";
import { useTimezone } from "@/shared/hooks/useTimezone";

const RECENT_TRANSACTION_RENDER_LIMIT = 3;

export default function RecentTransactionsWidget({ widget }: DashboardWidgetRendererProps) {
  const { data, isLoading } = useWidgetData<RecentTransactionsWidgetData>(
    "finance",
    widget.id,
    () => getWidgetData(widget.id) as Promise<RecentTransactionsWidgetData>
  );
  const { formatDate } = useTimezone();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.5rem" }}>
      {isLoading ? (
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>Loading…</div>
      ) : (data?.items?.length ?? 0) === 0 ? (
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>No recent transactions</div>
      ) : (
        data.items.slice(0, RECENT_TRANSACTION_RENDER_LIMIT).map((item) => {
          const isIncome = item.type === "income";

          return (
            <div
              key={item.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: isIncome
                      ? "var(--color-success-muted, oklch(0.72 0.19 145 / 0.15))"
                      : "var(--color-danger-muted, oklch(0.63 0.24 25 / 0.15))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isIncome ? "var(--color-success)" : "var(--color-danger)",
                    flexShrink: 0,
                  }}
                >
                  <DynamicIcon name={isIncome ? "ArrowUpRight" : "ArrowDownRight"} size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.note || "Untitled transaction"}
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-foreground-muted)" }}>
                  {formatDate(item.date)}
                  </div>
                </div>
              </div>
              <div className={isIncome ? "amount-positive" : "amount-negative"} style={{ fontWeight: 600 }}>
                {formatCurrency(item.amount)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

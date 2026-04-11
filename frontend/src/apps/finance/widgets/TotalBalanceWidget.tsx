import type { DashboardWidgetRendererProps } from "../types";

import { formatCurrency } from "../lib/formatCurrency";
import { getWidgetData, type TotalBalanceWidgetData } from "../api";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useWidgetData } from "@/lib/widget-data";

export default function TotalBalanceWidget({ widget }: DashboardWidgetRendererProps) {
  const { data, isLoading } = useWidgetData<TotalBalanceWidgetData>(
    "finance",
    widget.id,
    () => getWidgetData(widget.id) as Promise<TotalBalanceWidgetData>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {isLoading ? (
        <div className="stat-value" style={{ color: "var(--color-foreground-muted)" }}>—</div>
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
            <DynamicIcon name="Wallet" size={20} />
          </div>
          <div>
            <div className="stat-value" style={{ color: "var(--color-foreground)", fontSize: "1.75rem" }}>
              {formatCurrency(data?.total_balance ?? 0, data?.currency ?? "USD")}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginTop: "0.125rem" }}>
              {data?.wallet_name ? data.wallet_name : `${data?.wallet_count ?? 0} wallets`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

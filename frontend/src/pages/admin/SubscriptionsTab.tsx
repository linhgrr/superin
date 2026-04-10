import { useMemo } from "react";

import type { AdminSubscriptionRead } from "@/types/generated";
import { Pill } from "./Pill";
import { Table } from "./AdminTable";

interface SubscriptionsTabProps {
  subscriptions: AdminSubscriptionRead[];
}

export function SubscriptionsTab({ subscriptions }: SubscriptionsTabProps) {
  const rows = useMemo(
    () =>
      subscriptions.map((item: AdminSubscriptionRead) => [
        <div key={`sub-user:${item.id}`}>
          <div style={{ fontWeight: 600 }}>{item.user_email}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-foreground-muted)" }}>{item.user_name}</div>
        </div>,
        <Pill key={`sub-tier:${item.id}`}>{item.tier}</Pill>,
        <Pill key={`sub-status:${item.id}`}>{item.status}</Pill>,
        <div key={`sub-exp:${item.id}`}>{item.expires_at ? new Date(item.expires_at).toLocaleString() : "-"}</div>,
      ]),
    [subscriptions],
  );

  return <Table columns={["User", "Tier", "Status", "Expires At"]} rows={rows} />;
}

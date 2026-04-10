import { useMemo } from "react";

import type { AdminAppRead } from "@/types/generated";
import type { SubscriptionTier } from "@/types/generated";
import { Pill } from "./Pill";
import { Table } from "./AdminTable";
import { TierSelect } from "./TierSelect";

interface AppsTabProps {
  apps: AdminAppRead[];
  busyKey: string | null;
  onSetTier: (app: AdminAppRead, tier: SubscriptionTier) => void;
}

export function AppsTab({ apps, busyKey, onSetTier }: AppsTabProps) {
  const rows = useMemo(
    () =>
      apps.map((item) => [
        <div key={`app-name:${item.id}`}>
          <div style={{ fontWeight: 600 }}>{item.name}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-foreground-muted)" }}>{item.id}</div>
        </div>,
        <Pill key={`app-cat:${item.id}`}>{item.category}</Pill>,
        <TierSelect
          key={`app-tier:${item.id}`}
          value={item.requires_tier}
          disabled={busyKey === `app:${item.id}`}
          onChange={(next) => onSetTier(item, next)}
        />,
        <Pill key={`app-installs:${item.id}`}>{item.install_count}</Pill>,
      ]),
    [apps, busyKey, onSetTier],
  );

  return <Table columns={["App", "Category", "Requires Tier", "Installed"]} rows={rows} />;
}

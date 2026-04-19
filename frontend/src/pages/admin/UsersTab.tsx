import { useMemo } from "react";

import { UserRole } from "@/types/generated";
import type { AdminUserRead, SubscriptionTier } from "@/types/generated";
import { Pill } from "./Pill";
import { Table } from "./AdminTable";
import { TierSelect } from "./TierSelect";
import { getRoleBusyKey, getSubscriptionBusyKey, getNextRole } from "./admin-page-state";

interface UsersTabProps {
  users: AdminUserRead[];
  currentUserId: string | undefined;
  busyKey: string | null;
  onSetRole: (user: AdminUserRead, role: UserRole) => void;
  onSetTier: (userId: string, tier: SubscriptionTier) => void;
}

export function UsersTab({ users, currentUserId, busyKey, onSetRole, onSetTier }: UsersTabProps) {
  const rows = useMemo(
    () =>
      users.map((item) => [
        <div key={`email:${item.id}`}>
          <div style={{ fontWeight: 600 }}>{item.email}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-foreground-muted)" }}>{item.name}</div>
        </div>,
        <Pill key={`role:${item.id}`}>{item.role}</Pill>,
        <Pill key={`tier:${item.id}`}>{item.subscription.tier}</Pill>,
        <div key={`actions:${item.id}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onSetRole(item, getNextRole(item.role))}
            disabled={busyKey === getRoleBusyKey(item.id) || item.id === currentUserId}
            title={item.id === currentUserId ? "Cannot change your own role here" : undefined}
          >
            {item.role === UserRole.ADMIN ? "Demote" : "Promote"}
          </button>
          <TierSelect
            value={item.subscription.tier}
            disabled={busyKey === getSubscriptionBusyKey(item.id)}
            onChange={(next) => onSetTier(item.id, next)}
          />
        </div>,
      ]),
    [busyKey, currentUserId, users, onSetRole, onSetTier],
  );

  return <Table columns={["User", "Role", "Tier", "Actions"]} rows={rows} />;
}

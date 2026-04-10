import type { AdminStatsRead } from "@/types/generated";

interface AdminStatsProps {
  stats: AdminStatsRead | undefined;
}

export function AdminStats({ stats }: AdminStatsProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "0.75rem" }}>
      <div className="widget-card"><div className="widget-card-title">Users</div><div className="stat-value">{stats?.total_users ?? "-"}</div></div>
      <div className="widget-card"><div className="widget-card-title">Admins</div><div className="stat-value">{stats?.admin_users ?? "-"}</div></div>
      <div className="widget-card"><div className="widget-card-title">Active Subs</div><div className="stat-value">{stats?.active_subscriptions ?? "-"}</div></div>
      <div className="widget-card"><div className="widget-card-title">Paid Subs</div><div className="stat-value">{stats?.paid_subscriptions ?? "-"}</div></div>
      <div className="widget-card"><div className="widget-card-title">Installed Apps</div><div className="stat-value">{stats?.installed_apps ?? "-"}</div></div>
    </div>
  );
}
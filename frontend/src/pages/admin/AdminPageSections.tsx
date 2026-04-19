import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Shield from "lucide-react/dist/esm/icons/shield";

interface AdminAccessRequiredProps {
  message?: string;
}

export function AdminAccessRequired({
  message = "This area is restricted to admin users.",
}: AdminAccessRequiredProps) {
  return (
    <div className="widget-card" style={{ maxWidth: "560px" }}>
      <div className="widget-card-title" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Shield size={18} />
        Admin Access Required
      </div>
      <p style={{ color: "var(--color-foreground-muted)", margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

interface AdminPageHeaderProps {
  isRefreshing: boolean;
  onRefresh: () => void | Promise<void>;
}

export function AdminPageHeader({ isRefreshing, onRefresh }: AdminPageHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "1.35rem" }}>Admin</h1>
        <p style={{ margin: "0.35rem 0 0", color: "var(--color-foreground-muted)" }}>
          Manage users, subscriptions, and app access policy.
        </p>
      </div>
      <button className="btn btn-ghost" onClick={onRefresh} disabled={isRefreshing}>
        <RefreshCw size={16} />
        Refresh
      </button>
    </div>
  );
}

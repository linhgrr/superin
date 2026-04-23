import CreditCard from "lucide-react/dist/esm/icons/credit-card";
import Puzzle from "lucide-react/dist/esm/icons/puzzle";
import Users from "lucide-react/dist/esm/icons/users";

type AdminTab = "users" | "subscriptions" | "apps";

interface AdminTabsProps {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export function AdminTabs({ tab, onTabChange, search, onSearchChange }: AdminTabsProps) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <button className={`btn ${tab === "users" ? "btn-secondary" : "btn-ghost"}`} onClick={() => onTabChange("users")}><Users size={16} /> Users</button>
      <button className={`btn ${tab === "subscriptions" ? "btn-secondary" : "btn-ghost"}`} onClick={() => onTabChange("subscriptions")}><CreditCard size={16} /> Subscriptions</button>
      <button className={`btn ${tab === "apps" ? "btn-secondary" : "btn-ghost"}`} onClick={() => onTabChange("apps")}><Puzzle size={16} /> Apps</button>

      {tab === "users" && (
        <input
          aria-label="Search users by email"
          name="user-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by email…"
          style={{ marginLeft: "auto", minWidth: "260px" }}
        />
      )}
    </div>
  );
}

/**
 * Sidebar — Refined navigation with glassmorphism.
 *
 * Installed apps navigation with refined hover states.
 */

import { memo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Store, Sparkles } from "lucide-react";
import { useAppCatalog } from "@/components/providers/AppProviders";
import type { AppCatalogEntry } from "@/types/generated/api";

const APP_ICON_COLORS: Record<string, string> = {
  finance: "linear-gradient(135deg, oklch(0.72 0.19 145) 0%, oklch(0.65 0.22 145) 100%)",
  todo: "linear-gradient(135deg, oklch(0.65 0.21 280) 0%, oklch(0.60 0.23 280) 100%)",
};

function AppIcon({ entry }: { entry: AppCatalogEntry }) {
  const gradient = entry.color
    ? `linear-gradient(135deg, ${entry.color} 0%, ${entry.color}dd 100%)`
    : APP_ICON_COLORS[entry.id] || "linear-gradient(135deg, var(--color-primary) 0%, oklch(0.72 0.24 45) 100%)";

  return (
    <div
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "10px",
        background: gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.875rem",
        fontWeight: 700,
        flexShrink: 0,
        color: "white",
        boxShadow: "0 2px 8px oklch(0 0 0 / 0.25)",
        fontFamily: "var(--font-display)",
      }}
    >
      {entry.icon ? entry.icon.slice(0, 2).toUpperCase() : entry.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Sidebar() {
  const { installedApps } = useAppCatalog();
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Sparkles size={18} />
        </div>
        <span className="sidebar-brand-text">Shin</span>
      </div>

      {/* Navigation */}
      <nav style={{ padding: "0.75rem 0" }}>
        {/* Dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
        >
          <LayoutDashboard size={18} strokeWidth={2} />
          <span>Dashboard</span>
        </NavLink>

        {/* Installed Apps */}
        {installedApps.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <p className="section-label">Apps</p>
            {installedApps.map((app) => (
              <NavLink
                key={app.id}
                to={`/apps/${app.id}`}
                className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
              >
                <AppIcon entry={app} />
                <span>{app.name}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {/* Store */}
      <div style={{ marginTop: "auto", padding: "1rem", borderTop: "1px solid var(--color-border)" }}>
        <NavLink
          to="/store"
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
        >
          <Store size={18} strokeWidth={2} />
          <span>App Store</span>
        </NavLink>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

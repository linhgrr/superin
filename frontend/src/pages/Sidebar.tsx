/**
 * Sidebar — installed app icons + nav.
 *
 * Loaded from /api/catalog on mount.
 * Highlights the active app via current URL.
 */

import { memo, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Store } from "lucide-react";
import { getCatalog } from "@/api/catalog";
import type { AppCatalogEntry } from "@/types/generated/api";

const APP_ICON_COLORS: Record<string, string> = {
  finance: "oklch(0.72 0.19 145)",
  todo: "oklch(0.65 0.21 280)",
};

function AppIcon({ entry }: { entry: AppCatalogEntry }) {
  const color = entry.color || APP_ICON_COLORS[entry.id] || "var(--color-primary)";
  return (
    <div
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.875rem",
        fontWeight: 700,
        flexShrink: 0,
        color: "white",
      }}
    >
      {entry.icon ? entry.icon.slice(0, 2).toUpperCase() : entry.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Sidebar() {
  const [apps, setApps] = useState<AppCatalogEntry[]>([]);

  useEffect(() => {
    getCatalog()
      .then((catalog) => setApps(catalog.filter((a) => a.is_installed)))
      .catch(() => {}); // non-critical, sidebar stays empty
  }, []);

  return (
    <aside className="sidebar">
      {/* Logo / brand */}
      <div
        style={{
          padding: "1rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            color: "var(--color-primary-foreground)",
            fontSize: "0.875rem",
          }}
        >
          S
        </div>
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "var(--color-foreground)",
          }}
        >
          Shin
        </span>
      </div>

      {/* Home */}
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
      >
        <LayoutDashboard size={16} />
        <span>Dashboard</span>
      </NavLink>

      {/* Installed apps */}
      {apps.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p
            className="section-label"
            style={{ padding: "0 1rem", marginBottom: "0.25rem" }}
          >
            Apps
          </p>
          {apps.map((app) => (
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

      {/* Store */}
      <div style={{ marginTop: "auto", padding: "1rem", borderTop: "1px solid var(--color-border)" }}>
        <NavLink
          to="/store"
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
        >
          <Store size={16} />
          <span>App Store</span>
        </NavLink>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

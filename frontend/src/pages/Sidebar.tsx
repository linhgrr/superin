"use client";

/**
 * Sidebar — Refined navigation with glassmorphism.
 *
 * Installed apps navigation with refined hover states.
 * Now uses backend catalog as source of truth for icons and colors.
 */

import { memo, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Store, Sparkles, Settings } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { DynamicIcon } from "@/lib/icon-resolver";
import { prefetchHandlers } from "@/lib/prefetch";
import type { AppRuntimeEntry } from "@/types/generated/api";

/**
 * Generate a gradient from an oklch color string.
 * Creates a visually pleasing gradient based on the app's color.
 */
function generateGradient(color: string | undefined | null): string {
  if (!color) {
    return "linear-gradient(135deg, var(--color-primary) 0%, oklch(0.72 0.24 45) 100%)";
  }

  // If it's already a gradient, return as-is
  if (color.includes("gradient")) {
    return color;
  }

  // Parse oklch color and create a slightly darker variant for gradient
  // Expected format: "oklch(0.72 0.19 145)"
  const oklchMatch = color.match(/oklch\(([\d.]+)\s+([\d.]+)\s+(\d+)\)/);
  if (oklchMatch) {
    const l = parseFloat(oklchMatch[1]);
    const c = parseFloat(oklchMatch[2]);
    const h = parseInt(oklchMatch[3]);

    // Create a slightly darker/shifted variant for gradient end
    const l2 = Math.max(0.4, l - 0.07);
    const c2 = c * 1.1;

    return `linear-gradient(135deg, ${color} 0%, oklch(${l2} ${c2} ${h}) 100%)`;
  }

  // Fallback: just return a gradient using the provided color
  return `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`;
}

function AppIcon({ entry }: { entry: AppRuntimeEntry }) {
  const gradient = useMemo(() => generateGradient(entry.color), [entry.color]);

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
      {entry.icon ? (
        <DynamicIcon name={entry.icon} size={16} strokeWidth={2.5} />
      ) : (
        <span>{entry.name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function Sidebar() {
  const { installedApps } = useWorkspace();

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
                {...prefetchHandlers(app.id)} // Prefetch on hover/focus
              >
                <AppIcon entry={app} />
                <span>{app.name}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {/* Store & Settings */}
      <div style={{ marginTop: "auto", padding: "1rem", borderTop: "1px solid var(--color-border)" }}>
        <NavLink
          to="/store"
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
          style={{ marginBottom: "0.25rem" }}
        >
          <Store size={18} strokeWidth={2} />
          <span>App Store</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
        >
          <Settings size={18} strokeWidth={2} />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

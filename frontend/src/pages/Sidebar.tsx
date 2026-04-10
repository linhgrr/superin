"use client";

/**
 * Sidebar — Refined navigation with glassmorphism.
 *
 * Installed apps navigation with refined hover states.
 * Now uses backend catalog as source of truth for icons and colors.
 */

import { memo, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { DynamicIcon } from "@/lib/icon-resolver";
import { ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { prefetchHandlers } from "@/lib/prefetch";
import type { AppRuntimeEntry } from "@/types/generated";

import { generateGradient } from "@/components/store/generateGradient";

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
  const { isAdmin } = useAuth();

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <DynamicIcon name="Sparkles" size={18} />
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
          <DynamicIcon name="LayoutDashboard" size={18} />
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
          to={ROUTES.STORE}
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
          style={{ marginBottom: "0.25rem" }}
        >
          <DynamicIcon name="Store" size={18} />
          <span>App Store</span>
        </NavLink>
        <NavLink
          to={ROUTES.BILLING}
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
          style={{ marginBottom: "0.25rem" }}
        >
          <DynamicIcon name="CreditCard" size={18} />
          <span>Billing</span>
        </NavLink>
        {isAdmin && (
          <NavLink
            to={ROUTES.ADMIN}
            className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
            style={{ marginBottom: "0.25rem" }}
          >
            <DynamicIcon name="Shield" size={18} />
            <span>Admin</span>
          </NavLink>
        )}
        <NavLink
          to={ROUTES.SETTINGS}
          className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
        >
          <DynamicIcon name="Settings" size={18} />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

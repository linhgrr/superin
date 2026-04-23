import { memo, useMemo } from "react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { DynamicIcon } from "@/lib/icon-resolver";
import { prefetchHandlers } from "@/lib/prefetch";
import type { AppRuntimeEntry } from "@/types/generated";

import { generateGradient } from "@/components/store/generateGradient";

export interface SidebarStaticItem {
  icon: string;
  isUtility?: boolean;
  title: string;
  to: string;
}

interface SidebarLinkProps {
  collapsed: boolean;
  item: SidebarStaticItem;
}

function AppIcon({ entry }: { entry: AppRuntimeEntry }) {
  const gradient = useMemo(() => generateGradient(entry.color), [entry.color]);

  return (
    <div className="sidebar-app-icon" style={{ background: gradient }}>
      {entry.icon ? (
        <DynamicIcon name={entry.icon} size={16} strokeWidth={2.5} />
      ) : (
        <span className="sidebar-app-icon-fallback">{entry.name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function SidebarLink({ collapsed, item }: SidebarLinkProps) {
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.title : undefined}
      className={({ isActive }) =>
        `app-item${item.isUtility ? " sidebar-utility-item" : ""}${isActive ? " active" : ""}`
      }
    >
      <DynamicIcon name={item.icon} size={18} />
      <span className="sidebar-item-label">{item.title}</span>
    </NavLink>
  );
}

interface SidebarAppLinkProps {
  app: AppRuntimeEntry;
  collapsed: boolean;
}

function SidebarAppLink({ app, collapsed }: SidebarAppLinkProps) {
  return (
    <NavLink
      key={app.id}
      to={`/apps/${app.id}`}
      title={collapsed ? app.name : undefined}
      className={({ isActive }) => `app-item${isActive ? " active" : ""}`}
      {...prefetchHandlers(app.id)}
    >
      <AppIcon entry={app} />
      <span className="sidebar-item-label">{app.name}</span>
    </NavLink>
  );
}

interface SidebarSectionProps {
  children: ReactNode;
  title?: string;
}

function SidebarSection({ children, title }: SidebarSectionProps) {
  return (
    <section className="sidebar-section">
      {title ? <p className="section-label">{title}</p> : null}
      {children}
    </section>
  );
}

interface SidebarBrandProps {
  collapsed: boolean;
  onToggle: () => void;
}

function SidebarBrand({ collapsed, onToggle }: SidebarBrandProps) {
  return (
    <div className="sidebar-brand">
      <div className="sidebar-brand-lockup">
        <div className="sidebar-brand-icon" style={{ background: "transparent", boxShadow: "none" }}>
          <img src="/branding/logo.png" alt="Logo" width="40" height="40" className="theme-logo-light" style={{ width: "40px", height: "auto" }} />
          <img src="/branding/logo-white.png" alt="Logo" width="40" height="40" className="theme-logo-dark" style={{ width: "40px", height: "auto" }} />
        </div>
        <span className="sidebar-brand-text">Superin</span>
      </div>

      <button
        type="button"
        className="sidebar-collapse-button"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <DynamicIcon name="Menu" size={16} />
      </button>
    </div>
  );
}

export const MemoSidebarAppLink = memo(SidebarAppLink);
export const MemoSidebarBrand = memo(SidebarBrand);
export const MemoSidebarLink = memo(SidebarLink);
export const MemoSidebarSection = memo(SidebarSection);

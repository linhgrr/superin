/**
 * MobileTabBar — bottom navigation for mobile viewports.
 *
 * Replaces the hidden sidebar on mobile. Shows 4 primary destinations.
 * Touch targets are >= 56px for comfortable thumb interaction.
 *
 * Visible only on viewports <= 768px (controlled via CSS in globals.css).
 */

import { NavLink } from "react-router-dom";
import { DynamicIcon } from "@/lib/icon-resolver";
import { ROUTES } from "@/constants";

const TABS = [
  { to: ROUTES.DASHBOARD, label: "Dashboard", Icon: "LayoutDashboard" as const },
  { to: ROUTES.STORE, label: "Store", Icon: "Store" as const },
  { to: ROUTES.CHAT, label: "Chat", Icon: "MessageCircle" as const },
  { to: ROUTES.BILLING, label: "Billing", Icon: "CreditCard" as const },
  { to: ROUTES.SETTINGS, label: "Settings", Icon: "Settings" as const },
] as const;

export default function MobileTabBar() {
  return (
    <nav className="mobile-tab-bar" aria-label="Main navigation">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          className={({ isActive }) => `tab-link${isActive ? " active" : ""}`}
        >
          {({ isActive }) => (
            <>
              <DynamicIcon name={Icon} size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="tab-label">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

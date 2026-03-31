/**
 * AppShell — persistent layout wrapping the dashboard.
 *
 * 3-column grid: Sidebar | Main Content | Chat Panel
 * Handles responsive collapse.
 */

import { ReactNode, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Sidebar from "./Sidebar";
import Header from "./Header";
import ChatThread from "@/components/chat/ChatThread";

interface AppShellProps {
  children?: ReactNode;
  /** Override page title in the header */
  title?: string;
  /** Show/hide the right chat panel */
  showChat?: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  store: "App Store",
  finance: "Finance",
  todo: "Todo",
};

export default function AppShell({
  children,
  title,
  showChat = true,
}: AppShellProps) {
  const location = useLocation();

  const resolvedTitle = useMemo(() => {
    if (title) return title;

    const [, firstSegment, secondSegment] = location.pathname.split("/");
    if (firstSegment === "apps" && secondSegment) {
      return PAGE_TITLES[secondSegment] ?? secondSegment;
    }

    return PAGE_TITLES[firstSegment] ?? "Dashboard";
  }, [location.pathname, title]);

  return (
    <div className="dashboard-grid">
      {/* Left sidebar */}
      <Sidebar />

      {/* Main area */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        <Header title={resolvedTitle} />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
          }}
        >
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Right: Chat panel */}
      {showChat && <ChatThread />}
    </div>
  );
}

/**
 * AppShell — persistent layout wrapping the dashboard.
 *
 * 3-column grid: Sidebar | Main Content | Chat Panel
 * Handles responsive collapse.
 */

import { lazy, ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import Sidebar from "./Sidebar";
import Header from "./Header";

const ChatPanel = lazy(() => import("@/components/chat/ChatPanel"));

interface AppShellProps {
  children?: ReactNode;
  /** Override page title in the header */
  title?: string;
  /** Show/hide the right chat panel */
  showChat?: boolean;
}

/**
 * Build a map of page titles from the catalog.
 * Falls back to sentence-cased path segments.
 */
function usePageTitles(): Record<string, string> {
  const { installedApps } = useWorkspace();

  return useMemo(() => {
    const titles: Record<string, string> = {
      dashboard: "Dashboard",
      store: "App Store",
      settings: "Settings",
    };

    // Add titles from installed apps
    for (const app of installedApps) {
      titles[app.id] = app.name;
    }

    return titles;
  }, [installedApps]);
}

/**
 * Convert a kebab-case or camelCase string to Title Case.
 */
function toTitleCase(str: string): string {
  return str
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AppShell({
  children,
  title,
  showChat = true,
}: AppShellProps) {
  const location = useLocation();
  const pageTitles = usePageTitles();
  const [isChatReady, setIsChatReady] = useState(false);

  useEffect(() => {
    if (!showChat) {
      setIsChatReady(false);
      return;
    }

    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 150));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => setIsChatReady(true));

    return () => cancel(handle);
  }, [showChat]);

  const resolvedTitle = useMemo(() => {
    if (title) return title;

    const [, firstSegment, secondSegment] = location.pathname.split("/");
    if (firstSegment === "apps" && secondSegment) {
      return pageTitles[secondSegment] ?? toTitleCase(secondSegment);
    }

    return pageTitles[firstSegment] ?? toTitleCase(firstSegment) ?? "Dashboard";
  }, [location.pathname, title, pageTitles]);

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
      {showChat && (
        <Suspense fallback={<div className="chat-container" />}>
          {isChatReady ? <ChatPanel /> : <div className="chat-container" />}
        </Suspense>
      )}
    </div>
  );
}

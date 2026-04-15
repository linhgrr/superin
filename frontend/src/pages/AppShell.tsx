/**
 * AppShell — persistent layout wrapping the dashboard.
 *
 * 3-column grid: Sidebar | Main Content | Chat Panel
 * Handles responsive collapse.
 * Mobile: BottomTabBar + ChatFAB replace sidebar/panel.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";

import MobileChatFAB from "@/components/chat/MobileChatFAB";
import MobileTabBar from "@/components/navigation/MobileTabBar";
import { getShellRouteTitle } from "@/lib/routes";
import { useInstalledApps } from "@/stores/platform/workspaceStore";
import Sidebar from "./Sidebar";
import Header from "./Header";

const ChatPanel = lazy(() => import("@/components/chat/ChatPanel"));

interface AppShellProps {
  children?: ReactNode;
  title?: string;
  showChat?: boolean;
}

export default function AppShell({ children, title, showChat = true }: AppShellProps) {
  const location = useLocation();
  const installedApps = useInstalledApps();
  const [isChatReady, setIsChatReady] = useState(false);

  useEffect(() => {
    if (!showChat) {
      setIsChatReady(false);
      return;
    }

    const schedule = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(cb, 150));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => setIsChatReady(true));

    return () => cancel(handle);
  }, [showChat]);

  const resolvedTitle = useMemo(() => {
    return title ?? getShellRouteTitle(location.pathname, installedApps);
  }, [installedApps, location.pathname, title]);

  return (
    <>
      <div className="dashboard-grid">
        <Sidebar />

        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--color-border)" }}>
          <Header title={resolvedTitle} />
          <main style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
            {children ?? <Outlet />}
          </main>
          <MobileTabBar />
        </div>

        {showChat && (
          <aside className="app-shell-chat-panel">
            <Suspense fallback={<div className="chat-container" />}>
              {isChatReady ? <ChatPanel /> : <div className="chat-container" />}
            </Suspense>
          </aside>
        )}
      </div>
      <MobileChatFAB />
    </>
  );
}

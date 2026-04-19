/**
 * AppShell — persistent layout wrapping the dashboard.
 *
 * 3-column grid: Sidebar | Main Content | Chat Panel
 * Handles responsive collapse.
 * Mobile: BottomTabBar + ChatFAB replace sidebar/panel.
 */

import { lazy, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";

import MobileChatFAB from "@/components/chat/MobileChatFAB";
import { getShellRouteTitle } from "@/lib/routes";
import { useInstalledApps } from "@/stores/platform/workspaceStore";

import Header from "./Header";
import { ShellChatColumn, ShellMainColumn } from "./ShellColumns";
import Sidebar from "./sidebar/Sidebar";

const ChatPanel = lazy(() => import("@/components/chat/ChatPanel"));

interface AppShellProps {
  children?: ReactNode;
  title?: string;
  showChat?: boolean;
}

const CHAT_PANEL_FALLBACK = <div className="chat-container" />;

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
        <ShellMainColumn header={<Header title={resolvedTitle} />}>
          {children ?? <Outlet />}
        </ShellMainColumn>
        {showChat ? (
          <ShellChatColumn
            fallback={CHAT_PANEL_FALLBACK}
            isReady={isChatReady}
            panel={<ChatPanel />}
          />
        ) : null}
      </div>
      <MobileChatFAB />
    </>
  );
}

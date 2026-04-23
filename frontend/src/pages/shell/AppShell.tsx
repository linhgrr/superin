/**
 * AppShell — persistent layout wrapping the dashboard.
 *
 * Sidebar + main content, with optional composed chat panel.
 * Route layouts decide whether chat is present by passing a panel node.
 */

import { useMemo, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";

import MobileChatFAB from "@/components/chat/MobileChatFAB";
import { getShellRouteTitle } from "@/lib/routes";
import { useInstalledApps } from "@/stores/platform/workspaceStore";

import Header from "./Header";
import { ShellChatColumn, ShellMainColumn } from "./ShellColumns";
import Sidebar from "./sidebar/Sidebar";

interface AppShellProps {
  children?: ReactNode;
  title?: string;
  chatPanel?: ReactNode;
}

export default function AppShell({ children, title, chatPanel }: AppShellProps) {
  const location = useLocation();
  const installedApps = useInstalledApps();

  const resolvedTitle = useMemo(() => {
    return title ?? getShellRouteTitle(location.pathname, installedApps);
  }, [installedApps, location.pathname, title]);

  return (
    <>
      <a className="skip-link" href="#app-main-content">
        Skip to main content
      </a>
      <div className="dashboard-grid">
        <Sidebar />
        <ShellMainColumn header={<Header title={resolvedTitle} />}>
          {children ?? <Outlet />}
        </ShellMainColumn>
        {chatPanel ? <ShellChatColumn panel={chatPanel} /> : null}
      </div>
      {chatPanel ? <MobileChatFAB /> : null}
    </>
  );
}

/**
 * AppShell — persistent layout wrapping the dashboard.
 *
 * 3-column grid: Sidebar | Main Content | Chat Panel
 * Handles responsive collapse.
 */

import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import ChatPanel from "./ChatPanel";

interface AppShellProps {
  children: ReactNode;
  /** Override page title in the header */
  title?: string;
  /** Show/hide the right chat panel */
  showChat?: boolean;
}

export default function AppShell({
  children,
  title,
  showChat = true,
}: AppShellProps) {
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
        <Header title={title} />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
          }}
        >
          {children}
        </main>
      </div>

      {/* Right: Chat panel */}
      {showChat && <ChatPanel />}
    </div>
  );
}

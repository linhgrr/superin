import { Suspense, type ReactNode } from "react";

import MobileTabBar from "@/components/navigation/MobileTabBar";

interface ShellMainColumnProps {
  children: ReactNode;
  header: ReactNode;
}

export function ShellMainColumn({ children, header }: ShellMainColumnProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--color-border)" }}>
      {header}
      <main style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}

interface ShellChatColumnProps {
  fallback: ReactNode;
  isReady: boolean;
  panel: ReactNode;
}

export function ShellChatColumn({ fallback, isReady, panel }: ShellChatColumnProps) {
  return (
    <aside className="app-shell-chat-panel">
      <Suspense fallback={fallback}>
        {isReady ? panel : fallback}
      </Suspense>
    </aside>
  );
}

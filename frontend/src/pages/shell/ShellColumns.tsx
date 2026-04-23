import { Suspense, useEffect, useState, type ReactNode } from "react";

import MobileTabBar from "@/components/navigation/MobileTabBar";

interface ShellMainColumnProps {
  children: ReactNode;
  header: ReactNode;
}

export function ShellMainColumn({ children, header }: ShellMainColumnProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--color-border)" }}>
      {header}
      <main id="app-main-content" tabIndex={-1} style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}

interface ShellChatColumnProps {
  panel: ReactNode;
}

const CHAT_PANEL_FALLBACK = <div className="chat-container" />;

export function ShellChatColumn({ panel }: ShellChatColumnProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(cb, 150));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => setIsReady(true));

    return () => cancel(handle);
  }, []);

  return (
    <aside className="app-shell-chat-panel">
      <Suspense fallback={CHAT_PANEL_FALLBACK}>
        {isReady ? panel : CHAT_PANEL_FALLBACK}
      </Suspense>
    </aside>
  );
}

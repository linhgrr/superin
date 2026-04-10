/**
 * ChatPage — standalone chat page, full-height.
 *
 * Rendered at /chat as a dedicated chat view.
 */

import { lazy, Suspense } from "react";

const ChatPanel = lazy(() => import("@/components/chat/ChatPanel"));

function ChatFallback() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-foreground-muted)",
        fontSize: "0.875rem",
      }}
    >
      Loading…
    </div>
  );
}

export default function ChatPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Suspense fallback={<ChatFallback />}>
        <ChatPanel />
      </Suspense>
    </div>
  );
}

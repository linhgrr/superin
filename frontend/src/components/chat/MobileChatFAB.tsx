/**
 * MobileChatFAB — floating action button to open chat overlay on mobile.
 *
 * Only visible on viewports <= 768px via CSS.
 * Hidden on /chat because that route already renders the chat UI.
 */

import { lazy, Suspense, useState } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useLocation } from "react-router-dom";
import { ROUTES } from "@/constants";

const ChatOverlay = lazy(() => import("./ChatOverlay"));

export default function MobileChatFAB() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const isChatRoute = location.pathname === ROUTES.CHAT;

  if (isChatRoute) {
    return null;
  }

  return (
    <>
      <button
        className="mobile-chat-fab"
        onClick={() => setIsOpen(true)}
        aria-label="Open chat"
        type="button"
      >
        <DynamicIcon name="MessageCircle" size={22} strokeWidth={2} />
      </button>

      {isOpen && (
        <Suspense fallback={null}>
          <ChatOverlay onClose={() => setIsOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

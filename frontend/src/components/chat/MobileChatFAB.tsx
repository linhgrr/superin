/**
 * MobileChatFAB — floating action button to open chat overlay on mobile.
 *
 * Only visible on viewports <= 768px via CSS.
 * Hidden on /chat because that route already renders the chat UI.
 */

import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";

import { DynamicIcon } from "@/lib/icon-resolver";
import { isChatRoute } from "@/lib/routes";
import { useDisclosure } from "@/hooks/useDisclosure";

const ChatOverlay = lazy(() => import("./ChatOverlay"));

export default function MobileChatFAB() {
  const location = useLocation();
  const chatOverlay = useDisclosure();
  const hiddenOnRoute = isChatRoute(location.pathname);

  if (hiddenOnRoute) {
    return null;
  }

  return (
    <>
      <button
        className="mobile-chat-fab"
        onClick={chatOverlay.open}
        aria-label="Open chat"
        type="button"
      >
        <DynamicIcon name="MessageCircle" size={22} strokeWidth={2} />
      </button>

      {chatOverlay.isOpen && (
        <Suspense fallback={null}>
          <ChatOverlay onClose={chatOverlay.close} />
        </Suspense>
      )}
    </>
  );
}

/**
 * MobileChatFAB — floating action button to open chat overlay on mobile.
 *
 * Only visible on viewports <= 768px via CSS.
 */

import { lazy, Suspense, useState } from "react";
import { MessageCircle } from "lucide-react";

const ChatOverlay = lazy(() => import("./ChatOverlay"));

export default function MobileChatFAB() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="mobile-chat-fab"
        onClick={() => setIsOpen(true)}
        aria-label="Open chat"
        type="button"
      >
        <MessageCircle size={22} strokeWidth={2} />
      </button>

      {isOpen && (
        <Suspense fallback={null}>
          <ChatOverlay onClose={() => setIsOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

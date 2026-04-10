/**
 * ChatOverlay — full-screen overlay containing the chat panel.
 *
 * Used on mobile when the chat FAB is tapped.
 * ChatPanel renders its own header (Shin AI + subtitle) so this overlay
 * only needs the close button at the top.
 */

import { lazy, useCallback, useEffect, useRef } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";

const ChatPanel = lazy(() => import("./ChatPanel"));

interface ChatOverlayProps {
  onClose: () => void;
}

export default function ChatOverlay({ onClose }: ChatOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="chat-overlay-backdrop"
      onClick={handleBackdropClick}
    >
      <div className="chat-overlay-panel" role="dialog" aria-modal="true" aria-label="Chat">
        {/* Close button — ChatPanel provides its own header with title */}
        <div className="chat-overlay-header">
          <span />
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close chat"
            type="button"
          >
            <DynamicIcon name="X" size={18} />
          </button>
        </div>

        <div className="chat-overlay-content">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}

import { memo } from "react";

import { ChatRuntimeProvider } from "@/components/providers/InnerProviders";
import { useChatUiStore } from "@/stores/useChatUiStore";

import ChatThread from "./ChatThread";

const ChatPanel = memo(function ChatPanel() {
  const threadId = useChatUiStore((state) => state.activeThreadId);

  return (
    <ChatRuntimeProvider threadId={threadId}>
      {/* key={threadId} forces React to unmount the old ChatThread + ThreadPrimitive
          when threadId changes so ThreadPrimitive reinitializes with fresh state. */}
      <ChatThread key={threadId} threadId={threadId} />
    </ChatRuntimeProvider>
  );
});

export default ChatPanel;

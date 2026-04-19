import { memo } from "react";

import { ChatRuntimeProvider } from "@/components/providers/InnerProviders";

import ChatThread from "./ChatThread";

const ChatPanel = memo(function ChatPanel() {
  return (
    <ChatRuntimeProvider>
      <ChatThread />
    </ChatRuntimeProvider>
  );
});

export default ChatPanel;

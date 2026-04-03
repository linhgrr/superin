import { ChatRuntimeProvider } from "@/components/providers/InnerProviders";

import ChatThread from "./ChatThread";

export default function ChatPanel() {
  return (
    <ChatRuntimeProvider>
      <ChatThread />
    </ChatRuntimeProvider>
  );
}

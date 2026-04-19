/**
 * ChatThread — Full chat experience with thread history.
 *
 * Message management strategy:
 *   - assistant-ui + LangGraph runtime own active thread state and switching
 *   - Zustand owns local UI chrome only (history sidebar visibility)
 *   - Sidebar metadata remains a lightweight read model layered on the thread list
 */

import {
  ThreadPrimitive,
  useAui,
} from "@assistant-ui/react";

import ChatHeader from "@/components/chat/ChatHeader";
import ThreadHistorySidebar from "@/components/chat/ThreadHistorySidebar";
import { AssistantMessage, ChatComposer, UserMessage } from "@/components/chat/thread-parts";
import { useChatUiStore } from "@/stores/useChatUiStore";

export default function ChatThread() {
  const showHistory = useChatUiStore((state) => state.showHistory);
  const toggleHistory = useChatUiStore((state) => state.toggleHistory);
  const closeHistory = useChatUiStore((state) => state.closeHistory);
  const aui = useAui();

  return (
    <div className="flex flex-col h-full relative">
      <ChatHeader
        onNewChat={() => {
          void aui.threads().switchToNewThread();
          closeHistory();
        }}
        onOpenHistory={toggleHistory}
      />

      {showHistory && <ThreadHistorySidebar onClose={closeHistory} />}

      <ThreadPrimitive.Root className="chat-container">
        <ThreadPrimitive.Viewport
          autoScroll={true}
          turnAnchor="bottom"
          className="chat-messages"
        >
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.role === "user") return <UserMessage key={message.id} />;
              return <AssistantMessage key={message.id} />;
            }}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        <ChatComposer />
      </ThreadPrimitive.Root>
    </div>
  );
}

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

const CHAT_STARTERS = [
  {
    prompt: "Summarize what changed across my workspace today.",
    title: "Workspace Summary",
    description: "Get a concise recap of recent activity.",
  },
  {
    prompt: "Help me prioritize the next 3 things I should do.",
    title: "Prioritize Next Steps",
    description: "Turn your open work into a focused shortlist.",
  },
  {
    prompt: "Draft a message updating my team on current progress.",
    title: "Draft an Update",
    description: "Generate a polished status update quickly.",
  },
] as const;

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
          <ThreadPrimitive.Empty>
            <div className="chat-empty-state">
              <div className="chat-empty-eyebrow">Rin-chan is ready</div>
              <p className="chat-empty-description">
                Ask for planning, summaries, drafts, or help navigating what is already in your workspace.
              </p>
              <div className="chat-starter-grid">
                {CHAT_STARTERS.map((starter) => (
                  <ThreadPrimitive.Suggestion
                    key={starter.title}
                    className="chat-starter-card"
                    prompt={starter.prompt}
                    send
                  >
                    <div className="chat-starter-title">{starter.title}</div>
                    <div className="chat-starter-description">{starter.description}</div>
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </ThreadPrimitive.Empty>
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

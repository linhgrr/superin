/**
 * ChatThread — Full chat experience with thread history.
 *
 * Message management strategy:
 *   - SWR owns persisted server state (thread history + thread list)
 *   - Zustand owns local chat UI state (active thread + history sidebar)
 *   - assistant-ui runtime is hydrated from server history via reset()
 */

import {
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  ThreadPrimitive,
  useAssistantRuntime,
  useMessage,
  useMessagePartText,
} from "@assistant-ui/react";
import { DynamicIcon } from "@/lib/icon-resolver";
import React from "react";
import type { ThreadMessageLike } from "@assistant-ui/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import ChatHeader from "@/components/chat/ChatHeader";
import ThreadHistorySidebar from "@/components/chat/ThreadHistorySidebar";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useChatUiStore } from "@/stores/useChatUiStore";

/* ─── Primitive components ─────────────────────────────────────────── */

function TextPart() {
  const { text } = useMessagePartText();
  const textContent = typeof text === "string" ? text : String(text ?? "");
  return <div className="chat-text">{textContent}</div>;
}

function ThinkingDots() {
  return (
    <span className="chat-thinking-dots" aria-label="Thinking…">
      <span />
      <span />
      <span />
    </span>
  );
}

function AssistantText() {
  const { text } = useMessagePartText();
  const textContent = typeof text === "string" ? text : String(text ?? "");

  if (!textContent) return <ThinkingDots />;

  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
      <MessagePartPrimitive.InProgress>
        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
      </MessagePartPrimitive.InProgress>
    </div>
  );
}

function ToolCallBadge({ toolName, argsText }: { toolName: string; argsText?: string }) {
  return (
    <div className="tool-call-badge">
      <DynamicIcon name="Zap" size={12} className="font-semibold" />
      <span>{toolName}</span>
      {argsText ? (
        <span className="opacity-70">
          {argsText.slice(0, 40)}
          {argsText.length > 40 ? "…" : ""}
        </span>
      ) : null}
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-2">
      <div className="message-bubble message-bubble-user">
        <MessagePrimitive.Parts components={{ Text: TextPart }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessageContent() {
  const message = useMessage();
  const hasTextContent = message.content.some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.length > 0
  );
  const isInProgress = message.status.type === "running";
  const showThinking = isInProgress && !hasTextContent;

  return (
    <>
      {showThinking && <ThinkingDots />}
      <MessagePrimitive.Parts>
        {({ part }) => {
          if (part.type === "text") return <AssistantText />;
          if (part.type === "tool-call") {
            return (
              <div className="flex flex-wrap gap-1.5 mt-1">
                <ToolCallBadge toolName={part.toolName} argsText={part.argsText} />
              </div>
            );
          }
          return null;
        }}
      </MessagePrimitive.Parts>
    </>
  );
}

function AssistantMessage() {
  return (
    <div className="animate-fade-in-scale">
      <MessagePrimitive.Root className="flex justify-start mb-2">
        <div className="message-bubble message-bubble-assistant">
          <AssistantMessageContent />
        </div>
      </MessagePrimitive.Root>
      <MessagePrimitive.Error>
        <ErrorPrimitive.Root className="chat-error-message">
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
    </div>
  );
}

function ChatComposer() {
  return (
    <div className="chat-input-container" style={{ width: "100%" }}>
      <ComposerPrimitive.Root
        style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", width: "100%" }}
      >
        <ComposerPrimitive.Input
          placeholder="Ask Rin-chan anything... (Enter to send, Shift+Enter for new line)"
          maxRows={5}
          className="chat-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <ComposerPrimitive.Send asChild>
          <button type="submit" aria-label="Send message" className="chat-send-btn" style={{ flexShrink: 0 }}>
            <DynamicIcon name="Send" size={16} />
          </button>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  );
}

/* ─── ChatThread ───────────────────────────────────────────────────── */

interface ChatThreadProps {
  threadId: string;
}

export default function ChatThread({ threadId }: ChatThreadProps) {
  const { messages, loading, error } = useChatHistory(threadId);
  const runtime = useAssistantRuntime({ optional: true });
  const showHistory = useChatUiStore((state) => state.showHistory);
  const createNewThread = useChatUiStore((state) => state.createNewThread);
  const toggleHistory = useChatUiStore((state) => state.toggleHistory);
  const closeHistory = useChatUiStore((state) => state.closeHistory);
  const switchThread = useChatUiStore((state) => state.switchThread);

  // Track the last threadId + messages hash we've already loaded so we never
  // reset the same restored history twice on development re-renders.
  const lastLoadedKey = React.useRef<string>("");

  // Reset runtime + hydrate history messages whenever threadId changes.
  // Loading state gates the UI so old messages never flash.
  React.useEffect(() => {
    if (loading) return;
    if (!runtime) return;

    const loadKey = `${threadId}:${messages.length}:${messages.at(-1)?.id ?? ""}`;
    if (lastLoadedKey.current === loadKey) return; // Already loaded for this thread
    lastLoadedKey.current = loadKey;

    // Rebuild the runtime from the fetched history in a single pass.
    // Using append() per message on the external-store runtime can produce
    // branch/edit semantics instead of a linear restore, so hydrate via reset().
    const initialMessages: ThreadMessageLike[] = messages.map((msg) => ({
      role: msg.role,
      content: [{ type: "text" as const, text: msg.content }],
    }));

    runtime.thread.reset(initialMessages);
  }, [loading, messages, runtime, threadId]);

  // Show blank while loading — old messages are hidden until new history loads
  if (loading) {
    return (
      <div className="flex flex-col h-full relative">
        <ChatHeader onNewChat={createNewThread} onOpenHistory={toggleHistory} />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <ChatHeader onNewChat={createNewThread} onOpenHistory={toggleHistory} />

      {showHistory && (
        <ThreadHistorySidebar
          onClose={closeHistory}
          onSelectThread={switchThread}
        />
      )}

      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          Failed to load this conversation.
        </div>
      ) : (
        <>

          {/* ThreadPrimitive.Root — messages come from runtime.thread.reset(initialMessages) above */}
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
        </>
      )}
    </div>
  );
}

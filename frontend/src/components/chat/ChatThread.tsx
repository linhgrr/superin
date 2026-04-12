/**
 * ChatThread — Refined chat experience with @assistant-ui/react.
 * Simplified implementation using proper assistant-ui primitives.
 */

import {
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  ThreadPrimitive,
  useMessage,
  useMessagePartText,
} from "@assistant-ui/react";
import { DynamicIcon } from "@/lib/icon-resolver";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * TextPart — Plain text renderer with streaming support
 */
function TextPart() {
  const { text } = useMessagePartText();
  const textContent = typeof text === "string" ? text : String(text ?? "");
  return <div className="chat-text">{textContent}</div>;
}

/**
 * ThinkingDots — Animated waiting indicator while agent is processing
 */
function ThinkingDots() {
  return (
    <span className="chat-thinking-dots" aria-label="Thinking…">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * AssistantText — Markdown text renderer with streaming support
 */
function AssistantText() {
  const { text } = useMessagePartText();
  const textContent = typeof text === "string" ? text : String(text ?? "");

  if (!textContent) {
    return <ThinkingDots />;
  }

  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
      <MessagePartPrimitive.InProgress>
        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
      </MessagePartPrimitive.InProgress>
    </div>
  );
}

/**
 * ToolCallBadge — Compact tool execution indicator
 */
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

/**
 * UserMessage — Message bubble for user role
 */
function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-2">
      <div className="message-bubble message-bubble-user">
        <MessagePrimitive.Parts
          components={{
            Text: TextPart,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * AssistantMessageContent — Inner content with thinking indicator logic
 * Uses useMessage to detect in-progress state when no text has arrived yet.
 */
function AssistantMessageContent() {
  const message = useMessage();
  // Determine if we should show the thinking dots:
  // Message is still streaming (in_progress) AND has no text part with content yet
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

/**
 * AssistantMessage — Message bubble for assistant role with tool calls
 */
function AssistantMessage() {
  return (
    <div className="animate-fade-in-scale">
      <MessagePrimitive.Root className="flex justify-start mb-2">
        <div className="message-bubble message-bubble-assistant">
          <AssistantMessageContent />
        </div>
      </MessagePrimitive.Root>

      {/* Error display — only render when this message has an actual error */}
      <MessagePrimitive.Error>
        <ErrorPrimitive.Root className="chat-error-message">
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
    </div>
  );
}

/**
 * ChatComposer — Message input using assistant-ui primitives
 * Layout: input + send button side by side (full width)
 */
function ChatComposer() {
  return (
    <div className="chat-input-container" style={{ width: "100%" }}>
      <ComposerPrimitive.Root style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", width: "100%" }}>
        <ComposerPrimitive.Input
          placeholder="Ask Shin anything... (Enter to send, Shift+Enter for new line)"
          maxRows={5}
          className="chat-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <ComposerPrimitive.Send asChild>
          <button
            type="submit"
            aria-label="Send message"
            className="chat-send-btn"
            style={{ flexShrink: 0 }}
          >
            <DynamicIcon name="Send" size={16} />
          </button>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  );
}

/**
 * ChatThread — Main chat interface
 */
export default function ChatThread() {
  return (
    <ThreadPrimitive.Root className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div>
          <div className="chat-header-title">
            <span className="flex items-center gap-2">
              <DynamicIcon name="Sparkles" size={16} className="text-primary" />
              Shin AI
            </span>
          </div>
          <div className="chat-header-subtitle">Powered by RootAgent</div>
        </div>
      </div>

      {/* Messages */}
      <ThreadPrimitive.Viewport
        autoScroll={true}
        turnAnchor="bottom"
        className="chat-messages"
      >
        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.role === "user") {
              return <UserMessage key={message.id} />;
            }
            return <AssistantMessage key={message.id} />;
          }}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>

      {/* Input */}
      <ChatComposer />
    </ThreadPrimitive.Root>
  );
}

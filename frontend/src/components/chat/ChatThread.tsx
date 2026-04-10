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
  return (
    <div className="prose prose-sm prose-invert max-w-none break-words leading-snug whitespace-pre-wrap">
      {textContent}
    </div>
  );
}

/**
 * AssistantText — Markdown text renderer with streaming support
 */
function AssistantText() {
  const { text } = useMessagePartText();
  const textContent = typeof text === "string" ? text : String(text ?? "");

  if (!textContent) {
    return (
      <span className="flex items-center gap-2">
        <span className="animate-pulse">●</span>
        <span className="animate-pulse [animation-delay:0.2s]">●</span>
        <span className="animate-pulse [animation-delay:0.4s]">●</span>
      </span>
    );
  }

  return (
    <div className="prose prose-sm prose-invert max-w-none break-words leading-tight whitespace-pre-wrap [&_p]:my-0 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0 [&_ul_p]:my-0 [&_ol_p]:my-0 [&_li_p]:my-0">
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
 * AssistantMessage — Message bubble for assistant role with tool calls
 */
function AssistantMessage() {
  return (
    <div className="animate-fade-in-scale">
      <MessagePrimitive.Root className="flex justify-start mb-2">
        <div className="message-bubble message-bubble-assistant">
          <MessagePrimitive.Parts>
            {({ part }) => {
              // Text content
              if (part.type === "text") {
                return <AssistantText />;
              }

              // Tool call badges
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
        </div>
      </MessagePrimitive.Root>

      {/* Error display — use message.status from ThreadPrimitive context */}
      <ErrorPrimitive.Root className="mb-2 px-3.5 py-2.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-sm leading-snug">
        <ErrorPrimitive.Message />
      </ErrorPrimitive.Root>
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

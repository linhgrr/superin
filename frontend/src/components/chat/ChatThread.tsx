/**
 * ChatThread — Refined chat experience with @assistant-ui/react.
 * Simplified implementation using proper assistant-ui primitives.
 */

import {
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  AuiIf,
} from "@assistant-ui/react";
import { Zap, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * ToolCallBadge — Compact tool execution indicator
 */
function ToolCallBadge({ toolName, argsText }: { toolName: string; argsText?: string }) {
  return (
    <div className="tool-call-badge">
      <Zap size={12} className="font-semibold" />
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
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") {
              return (
                <div className="prose prose-sm prose-invert max-w-none break-words leading-snug whitespace-pre-wrap">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                </div>
              );
            }
            return null;
          }}
        </MessagePrimitive.Parts>
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
            {({ part, status }) => {
              // Text content
              if (part.type === "text") {
                const isStreaming = status?.type === "running" && !part.text;
                if (isStreaming) {
                  return (
                    <span className="flex items-center gap-2">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse [animation-delay:0.2s]">●</span>
                      <span className="animate-pulse [animation-delay:0.4s]">●</span>
                    </span>
                  );
                }
                return (
                  <div className="prose prose-sm prose-invert max-w-none break-words leading-snug whitespace-pre-wrap">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                  </div>
                );
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

      {/* Error display */}
      <AuiIf condition={(s) => !!s.message.status?.error}>
        <ErrorPrimitive.Root className="mb-2 px-3.5 py-2.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-sm leading-snug">
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </AuiIf>
    </div>
  );
}

/**
 * ChatComposer — Message input using assistant-ui primitives
 */
function ChatComposer() {
  return (
    <div className="chat-input-container">
      <ComposerPrimitive.Root>
        <ComposerPrimitive.Input
          placeholder="Ask Shin anything... (Enter to send, Shift+Enter for new line)"
          maxRows={5}
          className="chat-input"
        />
        <ComposerPrimitive.Send className="chat-send-btn" asChild>
          <button type="submit" aria-label="Send message">
            <Send size={16} />
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
              <Sparkles size={16} className="text-primary" />
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
              return <UserMessage />;
            }
            return <AssistantMessage />;
          }}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>

      {/* Input */}
      <ChatComposer />
    </ThreadPrimitive.Root>
  );
}


/**
 * ChatThread — Refined chat experience with @assistant-ui/react.
 */

"use client";

import {
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { Zap, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function ToolCallBadge({
  toolName,
  argsText,
}: {
  toolName: string;
  argsText?: string;
}) {
  return (
    <div className="tool-call-badge">
      <Zap size={12} style={{ fontWeight: 600 }} />
      <span>{toolName}</span>
      {argsText ? (
        <span style={{ opacity: 0.7 }}>
          {argsText.slice(0, 40)}
          {argsText.length > 40 ? "…" : ""}
        </span>
      ) : null}
    </div>
  );
}

function MessageBubble() {
  const message = useMessage();
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const textParts = message.content.filter((part) => part.type === "text") as {
    type: "text";
    text: string;
  }[];
  const toolParts = message.content.filter((part) => part.type === "tool-call") as {
    type: "tool-call";
    toolName: string;
    argsText?: string;
  }[];

  const isRunning = isAssistant && message.status?.type === "running";

  return (
    <div style={{ animation: "fadeInScale 0.2s ease" }}>
      <div
        style={{
          display: "flex",
          justifyContent: isUser ? "flex-end" : "flex-start",
          marginBottom: "0.5rem",
        }}
      >
        <div
          className={isUser ? "message-bubble message-bubble-user" : "message-bubble message-bubble-assistant"}
        >
          {textParts.map((part, index) => (
            <div
              key={index}
              className="prose prose-sm prose-invert max-w-none break-words leading-snug [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_li>p]:my-0 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-1 [&_h4]:my-1 [&_hr]:my-2"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            </div>
          ))}
          {isRunning && textParts.length === 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="animate-pulse">●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
            </span>
          ) : null}
        </div>
      </div>

      {isAssistant && toolParts.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.375rem",
            marginBottom: "0.5rem",
            justifyContent: isUser ? "flex-end" : "flex-start",
          }}
        >
          {toolParts.map((part) => (
            <ToolCallBadge
              key={part.toolName}
              toolName={part.toolName}
              argsText={part.argsText}
            />
          ))}
        </div>
      ) : null}

      <MessagePrimitive.Error>
        <ErrorPrimitive.Root
          style={{
            marginBottom: "0.5rem",
            padding: "0.625rem 0.875rem",
            borderRadius: "0.75rem",
            background: "oklch(0.62 0.22 25 / 0.12)",
            border: "1px solid oklch(0.62 0.22 25 / 0.28)",
            color: "var(--color-danger)",
            fontSize: "0.8125rem",
            lineHeight: 1.45,
          }}
        >
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
    </div>
  );
}

export default function ChatThread() {
  return (
    <ThreadPrimitive.Root className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div>
          <div className="chat-header-title">
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles size={16} style={{ color: "var(--color-primary)" }} />
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
        <ThreadPrimitive.Messages
          components={{
            UserMessage: MessageBubble,
            AssistantMessage: MessageBubble,
            SystemMessage: MessageBubble,
          }}
        />
      </ThreadPrimitive.Viewport>

      {/* Input */}
      <ComposerPrimitive.Root className="chat-input-container">
        <ComposerPrimitive.Input
          placeholder="Ask Shin anything... (Enter to send)"
          maxRows={5}
          className="chat-input"
        />
        <ComposerPrimitive.Send className="chat-send-btn">
          <Send size={16} />
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

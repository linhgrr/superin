/**
 * ChatThread — chat UI built with @assistant-ui/react primitives.
 *
 * Runtime: shared via AppProviders (AssistantRuntimeProvider wrapping the whole app).
 * This component only renders the ThreadPrimitive — no runtime creation here.
 */

"use client";

import {
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { Zap } from "lucide-react";
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
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        background: "oklch(0.65 0.21 280 / 0.1)",
        border: "1px solid oklch(0.65 0.21 280 / 0.3)",
        borderRadius: "999px",
        padding: "0.2rem 0.625rem",
        fontSize: "0.6875rem",
        color: "var(--color-primary)",
        fontFamily: "monospace",
      }}
    >
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
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: isUser ? "flex-end" : "flex-start",
          marginBottom: "0.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "85%",
            padding: "0.625rem 0.875rem",
            borderRadius: "0.875rem",
            background: isUser
              ? "var(--color-primary)"
              : "var(--color-surface-elevated)",
            color: isUser
              ? "var(--color-primary-foreground)"
              : "var(--color-foreground)",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
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
            <span style={{ color: "var(--color-muted)" }}>Thinking…</span>
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
            background: "oklch(0.63 0.24 25 / 0.12)",
            border: "1px solid oklch(0.63 0.24 25 / 0.28)",
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
    <ThreadPrimitive.Root
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
      }}
    >
      <ThreadPrimitive.Viewport
        autoScroll={true}
        turnAnchor="bottom"
        style={{ flex: 1, overflowY: "auto", padding: "1rem" }}
      >
        <ThreadPrimitive.Messages
          components={{
            UserMessage: MessageBubble,
            AssistantMessage: MessageBubble,
            SystemMessage: MessageBubble,
          }}
        />
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          gap: "0.5rem",
          alignItems: "flex-end",
        }}
      >
        <ComposerPrimitive.Input
          placeholder="Ask Rin... (Enter to send)"
          maxRows={5}
          style={{
            flex: 1,
            background: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.75rem",
            padding: "0.5rem 0.75rem",
            color: "var(--color-foreground)",
            fontSize: "0.875rem",
            outline: "none",
            resize: "none",
            overflowY: "auto",
            lineHeight: 1.5,
          }}
        />
        <ComposerPrimitive.Send
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "2.25rem",
            height: "2.25rem",
            borderRadius: "0.75rem",
            background: "var(--color-primary)",
            color: "var(--color-primary-foreground)",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22,2 15,22 11,13 2,9" />
          </svg>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

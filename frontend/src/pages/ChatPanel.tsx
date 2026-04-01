/**
 * ChatPanel — right-side chat thread for the RootAgent.
 *
 * Powered by useStreamingChat.
 * Shows tool calls inline when they fire.
 */

import { useEffect, useRef } from "react";
import { useStreamingChat } from "@/hooks/useStreamingChat";

function ToolCallBadge({
  name,
  argsText,
}: {
  name: string;
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
      <span style={{ fontWeight: 600 }}>⚡</span>
      <span>{name}</span>
      {argsText && (
        <span style={{ opacity: 0.7 }}>{argsText.slice(0, 40)}{argsText.length > 40 ? "…" : ""}</span>
      )}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  toolCalls: _toolCalls,
}: {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { id: string; name: string; argsText?: string }[];
}) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "0.75rem",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "0.5rem 0.75rem",
          borderRadius: "0.75rem",
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
        {content}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const { messages, isStreaming, error, send, cancel, clearMessages } =
    useStreamingChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim()) return;
    const value = input.value.trim();
    input.value = "";
    await send(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e);
    }
  }

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Shin AI</div>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-muted)" }}>
            Powered by Linhdz
          </div>
        </div>
        {messages.length > 0 && (
          <button
            className="btn btn-ghost"
            onClick={clearMessages}
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--color-muted)",
              fontSize: "0.875rem",
              marginTop: "2rem",
            }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>✨</div>
            Ask Rin anything about your apps.
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <MessageBubble
              role={msg.role}
              content={msg.content}
              toolCalls={msg.toolCalls}
            />
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.375rem",
                  marginBottom: "0.5rem",
                  paddingLeft: msg.role === "user" ? "auto" : "0",
                  justifyContent:
                    msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.toolCalls.map((tc) => (
                  <ToolCallBadge
                    key={tc.id}
                    name={tc.name}
                    argsText={tc.argsText}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {isStreaming && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              marginBottom: "0.75rem",
            }}
          >
            <div
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "0.75rem",
                background: "var(--color-surface-elevated)",
                color: "var(--color-muted)",
                fontSize: "0.875rem",
              }}
            >
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              background: "oklch(0.63 0.24 25 / 0.1)",
              color: "var(--color-danger)",
              fontSize: "0.8125rem",
              marginBottom: "0.75rem",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <textarea
          ref={inputRef}
          onKeyDown={handleKeyDown}
          placeholder="Ask Shin… (Enter to send)"
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            overflowY: "auto",
            maxHeight: "120px",
            lineHeight: "1.5",
          }}
        />
        {isStreaming ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={cancel}
            title="Cancel"
            style={{ alignSelf: "flex-end" }}
          >
            ⏹
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary"
            title="Send"
            style={{ alignSelf: "flex-end", padding: "0.5rem 0.75rem" }}
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
          </button>
        )}
      </form>
    </aside>
  );
}

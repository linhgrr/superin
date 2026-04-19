import {
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  useMessage,
  useMessagePartText,
} from "@assistant-ui/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { DynamicIcon } from "@/lib/icon-resolver";

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

export function UserMessage() {
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
    (part) => part.type === "text" && typeof part.text === "string" && part.text.length > 0,
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
              <div className="mt-1 flex flex-wrap gap-1.5">
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

export function AssistantMessage() {
  return (
    <div className="animate-fade-in-scale">
      <MessagePrimitive.Root className="mb-2 flex justify-start">
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

export function ChatComposer() {
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

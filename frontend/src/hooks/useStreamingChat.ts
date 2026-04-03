/**
 * useStreamingChat — SSE streaming hook for the RootAgent chat.
 *
 * Uses fetch for streaming (browser-native support) with auth token
 * from axios. All auth handling (refresh, redirect) is managed by
 * axios interceptors.
 *
 * Usage:
 *   const { send, messages, isStreaming, error } = useStreamingChat();
 *   await send("Hello");
 */

import { useCallback, useRef, useState } from "react";
import { API_BASE_URL } from "@/config";
import { API_PATHS } from "@/constants";
import { getAccessToken } from "@/api/axios";
import type { ChatStreamEvent } from "@/types/generated/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ChatStreamToolCall[];
}

interface ChatStreamToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsText?: string;
}

function nanoid() {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * Read SSE stream and yield parsed events
 */
async function* readSSEStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;

        try {
          const event = JSON.parse(raw) as ChatStreamEvent;
          yield event;
        } catch (error: unknown) {
          console.error("Failed to parse streaming chat event line", error);
        }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        const raw = trimmed.slice(5).trim();
        if (raw && raw !== "[DONE]") {
          try {
            const event = JSON.parse(raw) as ChatStreamEvent;
            yield event;
          } catch (error: unknown) {
            console.error("Failed to parse trailing streaming chat event", error);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function useStreamingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (input: string) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: input,
      };

      const assistantMsg: ChatMessage = {
        id: nanoid(),
        role: "assistant",
        content: "",
        toolCalls: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);

      try {
        const token = getAccessToken();

        if (!token) {
          // No token - auth will fail, let it fail naturally
          throw new Error("Not authenticated");
        }

        const res = await fetch(`${API_BASE_URL}${API_PATHS.CHAT_STREAM}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: input }),
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            // Token expired - let axios interceptor handle refresh and redirect
            throw new Error("Session expired");
          }
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`
          );
        }

        await processStream(res, assistantMsg.id);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Cancelled — not an error, remove empty assistant msg
          setMessages((prev) => prev.slice(0, -1));
        } else {
          const errorMsg = err instanceof Error ? err.message : "Stream failed";
          setError(errorMsg);
          setMessages((prev) => prev.slice(0, -1));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }

      async function processStream(res: Response, assistantId: string) {
        if (!res.body) throw new Error("No response body");

        for await (const event of readSSEStream(res.body)) {
          if (event.type === "token") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant" || last.id !== assistantId) return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + event.content },
              ];
            });
          } else if (event.type === "tool_call") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant" || last.id !== assistantId) return prev;
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  toolCalls: [
                    ...(last.toolCalls ?? []),
                    {
                      id: event.tool_call_id,
                      name: event.tool_name,
                      args: event.args,
                      argsText: event.args_text ?? undefined,
                    },
                  ],
                },
              ];
            });
          } else if (event.type === "done") {
            break;
          } else if (event.type === "error") {
            setError(event.message);
            break;
          }
        }
      }
    },
    []
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isStreaming, error, send, cancel, clearMessages };
}

/**
 * useStreamingChat — SSE streaming hook for the RootAgent chat.
 *
 * Uses axios for consistent auth handling with automatic refresh on 401.
 *
 * Usage:
 *   const { send, messages, isStreaming, error } = useStreamingChat();
 *   await send("Hello");
 */

import { useCallback, useRef, useState } from "react";
import { axiosInstance, getAccessToken } from "@/api/axios";
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
        // Use axios but with fetch-like streaming response
        const token = getAccessToken();
        const baseURL = axiosInstance.defaults.baseURL;

        const res = await fetch(`${baseURL}/api/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: input }),
          credentials: "include",
          signal: controller.signal,
        });

        // Handle 401 - let axios interceptor handle refresh and retry
        if (res.status === 401) {
          // Trigger axios interceptor refresh logic
          try {
            await axiosInstance.post("/api/auth/refresh");
            // Retry with new token
            const newToken = getAccessToken();
            const retryRes = await fetch(`${baseURL}/api/chat/stream`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
              },
              body: JSON.stringify({ message: input }),
              credentials: "include",
              signal: controller.signal,
            });
            if (!retryRes.ok) {
              throw new Error(`HTTP ${retryRes.status}`);
            }
            // Continue with retryRes
            await processStream(retryRes, assistantMsg.id);
            return;
          } catch {
            // Refresh failed - will be caught below and show error
            throw new Error("Authentication failed");
          }
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`
          );
        }

        await processStream(res, assistantMsg.id);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Cancelled — not an error
          setMessages((prev) => prev.slice(0, -1)); // remove empty assistant msg
        } else {
          setError(err instanceof Error ? err.message : "Stream failed");
          setMessages((prev) => prev.slice(0, -1)); // remove failed assistant msg
        }
      } finally {
        setIsStreaming(false);
      }

      async function processStream(res: Response, assistantId: string) {
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // SSE: each line is "data: {...}"
          for (const line of chunk.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const raw = trimmed.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;

            try {
              const event = JSON.parse(raw) as ChatStreamEvent;

              if (event.type === "token") {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (!last || last.role !== "assistant") return prev;
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + event.content },
                  ];
                });
              } else if (event.type === "tool_call") {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (!last || last.role !== "assistant") return prev;
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
              } else if (event.type === "done" || event.type === "error") {
                if (event.type === "error") {
                  setError(event.message);
                }
                break;
              }
            } catch {
              // Ignore malformed JSON lines
            }
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

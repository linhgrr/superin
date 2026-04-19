/**
 * Chat API client — thread history endpoints.
 * Backend provides canonical LangGraph-backed thread state.
 */

import type {
  LangChainMessage,
  LangGraphMessagesEvent,
} from "@assistant-ui/react-langgraph";
import { mutate } from "swr";

import { API_BASE_URL } from "@/config";
import { getAccessToken } from "@/api/auth-session";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface ChatHistoryResponse {
  threadId: string;
  messages: ChatMessage[];
}

export interface ChatThreadMeta {
  threadId: string;
  status: "regular" | "archived";
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThreadsResponse {
  threads: ChatThreadMeta[];
}

export const CHAT_THREADS_CACHE_KEY = "chat/threads";

export function refreshChatThreads(): void {
  void mutate(CHAT_THREADS_CACHE_KEY);
}

async function requestJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(url, {
    method: init?.method,
    body: init?.body,
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Chat API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function toLangChainMessages(messages: ChatMessage[]): LangChainMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "user") {
      return [
        {
          id: message.id,
          type: "human",
          content: message.content,
        } satisfies LangChainMessage,
      ];
    }

    if (message.role === "assistant") {
      return [
        {
          id: message.id,
          type: "ai",
          content: message.content,
        } satisfies LangChainMessage,
      ];
    }

    return [];
  });
}

async function* parseLangGraphEventStream(
  response: Response,
): AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Chat stream response has no readable body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const payloadLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6));

      const payload = payloadLines.join("\n").trim();
      if (!payload) {
        boundary = buffer.indexOf("\n\n");
        continue;
      }

      if (payload === "[DONE]") {
        return;
      }

      yield JSON.parse(payload) as LangGraphMessagesEvent<LangChainMessage>;

      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      return;
    }
  }
}

export const chatApi = {
  /** Restore messages for an existing thread (called on mount / thread switch). */
  getHistory: (threadId: string): Promise<ChatHistoryResponse> =>
    requestJSON<ChatHistoryResponse>(
      `${API_BASE_URL}/api/chat/history?thread_id=${encodeURIComponent(threadId)}`
    ),

  /** List all threads for history sidebar. */
  getThreads: (includeArchived = true): Promise<ChatThreadsResponse> =>
    requestJSON<ChatThreadsResponse>(
      `${API_BASE_URL}/api/chat/threads?include_archived=${includeArchived ? "true" : "false"}`
    ),

  /** Fetch metadata for one thread. */
  getThread: (threadId: string): Promise<ChatThreadMeta> =>
    requestJSON<ChatThreadMeta>(
      `${API_BASE_URL}/api/chat/threads/${encodeURIComponent(threadId)}`
    ),

  /** Rename one thread. */
  renameThread: async (threadId: string, title: string): Promise<ChatThreadMeta> => {
    const thread = await requestJSON<ChatThreadMeta>(`${API_BASE_URL}/api/chat/threads/${encodeURIComponent(threadId)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    refreshChatThreads();
    return thread;
  },

  /** Archive one thread. */
  archiveThread: async (threadId: string): Promise<ChatThreadMeta> => {
    const thread = await requestJSON<ChatThreadMeta>(`${API_BASE_URL}/api/chat/threads/${encodeURIComponent(threadId)}/archive`, {
      method: "POST",
    });
    refreshChatThreads();
    return thread;
  },

  /** Unarchive one thread. */
  unarchiveThread: async (threadId: string): Promise<ChatThreadMeta> => {
    const thread = await requestJSON<ChatThreadMeta>(`${API_BASE_URL}/api/chat/threads/${encodeURIComponent(threadId)}/unarchive`, {
      method: "POST",
    });
    refreshChatThreads();
    return thread;
  },

  /** Delete one thread. */
  deleteThread: async (threadId: string): Promise<{ threadId: string; deleted: boolean }> => {
    const result = await requestJSON<{ threadId: string; deleted: boolean }>(`${API_BASE_URL}/api/chat/threads/${encodeURIComponent(threadId)}`, {
      method: "DELETE",
    });
    refreshChatThreads();
    return result;
  },

  /** Load canonical LangGraph thread messages for runtime hydration. */
  loadLangGraphThread: async (
    threadId: string,
  ): Promise<{ messages: LangChainMessage[] }> => {
    const history = await chatApi.getHistory(threadId);
    return {
      messages: toLangChainMessages(history.messages),
    };
  },

  /** Stream current chat endpoint and read LangGraph-compatible events. */
  streamLangGraph: async function* ({
    threadId,
    messages,
    abortSignal,
  }: {
    threadId: string;
    messages: LangChainMessage[];
    abortSignal: AbortSignal;
  }): AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>> {
    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: "POST",
      signal: abortSignal,
      headers: {
        Authorization: `Bearer ${token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        threadId,
        messages: messages.map((message) => ({
          id: message.id,
          role:
            message.type === "human"
              ? "user"
              : message.type === "ai"
                ? "assistant"
                : "tool",
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error ${response.status}: ${response.statusText}`);
    }

    try {
      yield* parseLangGraphEventStream(response);
    } finally {
      refreshChatThreads();
    }
  },
};

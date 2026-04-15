/**
 * Chat API client — thread history endpoints.
 * Backend provides server-owned persistence; FE always fetches from here.
 */

import { API_BASE_URL } from "@/config";
import { getAccessToken } from "@/api/axios";

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
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThreadsResponse {
  threads: ChatThreadMeta[];
}

async function fetchJSON<T>(url: string): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Chat API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const chatApi = {
  /** Restore messages for an existing thread (called on mount / thread switch). */
  getHistory: (threadId: string): Promise<ChatHistoryResponse> =>
    fetchJSON(`${API_BASE_URL}/api/chat/history?thread_id=${encodeURIComponent(threadId)}`),

  /** List all threads for history sidebar. */
  getThreads: (): Promise<ChatThreadsResponse> =>
    fetchJSON(`${API_BASE_URL}/api/chat/threads`),
};

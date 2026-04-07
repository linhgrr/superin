/**
 * Inner providers — internal implementation details.
 */

import type { ReactNode } from "react";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";

import { getAccessToken } from "@/api/client";
import { API_BASE_URL } from "@/config";
import { API_PATHS } from "@/constants";

function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useDataStreamRuntime({
    api: `${API_BASE_URL}${API_PATHS.CHAT_STREAM}`,
    protocol: "ui-message-stream",
    credentials: "include",
    headers: async () => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    },
    onFinish: () => {
      // Composer is automatically reset by assistant-ui primitives after successful send
    },
    onError: (error: Error) => {
      if (error.name === "AbortError" || error.message?.includes("BodyStreamBuffer")) {
        return;
      }
      console.error("[ChatRuntime]", error);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export { ChatRuntimeProvider };

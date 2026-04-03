/**
 * Inner providers — internal implementation details.
 */

import { useRef, type ReactNode } from "react";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useDataStreamRuntime, type DataStreamRuntime } from "@assistant-ui/react-data-stream";

import { getAccessToken } from "@/api/client";
import { API_BASE_URL } from "@/config";
import { API_PATHS } from "@/constants";

function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const runtimeRef = useRef<DataStreamRuntime | null>(null);

  const runtime = useDataStreamRuntime({
    api: `${API_BASE_URL}${API_PATHS.CHAT_STREAM}`,
    protocol: "data-stream",
    credentials: "include",
    headers: () => {
      const token = getAccessToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
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

  runtimeRef.current = runtime;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export { ChatRuntimeProvider };

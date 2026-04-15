/**
 * Inner providers — internal implementation details.
 */

import { memo, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";

import { getAccessToken } from "@/api/axios";
import { API_BASE_URL } from "@/config";
import { API_PATHS } from "@/constants";
import { useRenderLoopDebug } from "@/lib/debug-render-loop";

const CHAT_STREAM_API = `${API_BASE_URL}${API_PATHS.CHAT_STREAM}`;

const ChatRuntimeProvider = memo(function ChatRuntimeProvider({
  children,
  threadId,
}: {
  children: ReactNode;
  /** Client-generated thread identity. Must be stable across page reloads. */
  threadId: string;
}) {
  useRenderLoopDebug("ChatRuntimeProvider");

  const getHeaders = useCallback(async () => {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const handleError = useCallback((error: Error) => {
    if (error.name === "AbortError" || error.message?.includes("BodyStreamBuffer")) {
      return;
    }
    console.error("[ChatRuntime]", error);
  }, []);

  const runtimeOptions = useMemo(
    () => ({
      api: CHAT_STREAM_API,
      protocol: "ui-message-stream" as const,
      credentials: "include" as const,
      headers: getHeaders,
      onError: handleError,
      // Enable so backend can deduplicate by message id on retries
      sendExtraMessageFields: true,
      // Inject threadId into every request body — backend requires it
      body: { threadId },
    }),
    [getHeaders, handleError, threadId]
  );

  const runtime = useDataStreamRuntime(runtimeOptions);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
});

export { ChatRuntimeProvider };

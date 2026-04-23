/**
 * Inner providers — runtime wiring for LangGraph chat + remote thread list.
 */

import { memo, useMemo } from "react";
import type { ReactNode } from "react";

import {
  AssistantRuntimeProvider,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";

import { chatApi } from "@/api/chat";
import { useChatThinkingStore } from "@/stores/useChatThinkingStore";

function useBackendThreadListAdapter(): RemoteThreadListAdapter {
  return useMemo(
    () => ({
      list: async () => {
        const { threads } = await chatApi.getThreads();
        return {
          threads: threads.map((thread) => ({
            remoteId: thread.threadId,
            externalId: thread.threadId,
            title: thread.title,
            status: thread.status,
          })),
        };
      },
      initialize: async (threadId) => {
        return {
          remoteId: threadId,
          externalId: threadId,
        };
      },
      fetch: async (threadId) => {
        const thread = await chatApi.getThread(threadId);
        return {
          remoteId: thread.threadId,
          externalId: thread.threadId,
          title: thread.title,
          status: thread.status,
        };
      },
      rename: async (threadId, title) => {
        await chatApi.renameThread(threadId, title);
      },
      archive: async (threadId) => {
        await chatApi.archiveThread(threadId);
      },
      unarchive: async (threadId) => {
        await chatApi.unarchiveThread(threadId);
      },
      delete: async (threadId) => {
        await chatApi.deleteThread(threadId);
      },
      generateTitle: async () => new ReadableStream(),
    }),
    [],
  );
}

function useChatThreadRuntime() {
  const beginRun = useChatThinkingStore((state) => state.beginRun);
  const endRun = useChatThinkingStore((state) => state.endRun);
  const clearThinking = useChatThinkingStore((state) => state.clear);
  const applyThinkingEvent = useChatThinkingStore((state) => state.applyThinkingEvent);

  return useLangGraphRuntime({
    load: async (externalId) => {
      clearThinking();
      return chatApi.loadLangGraphThread(externalId);
    },
    stream: async function* (messages, { abortSignal, initialize }) {
      beginRun();
      const { externalId, remoteId } = await initialize();
      const threadId = externalId ?? remoteId;

      try {
        yield* chatApi.streamLangGraph({
          threadId,
          messages,
          abortSignal,
        });
      } finally {
        endRun();
      }
    },
    eventHandlers: {
      onError: (error) => {
        console.error("[ChatRuntime]", error);
      },
      onCustomEvent: (eventType, data) => {
        applyThinkingEvent(eventType, data);
      },
    },
  });
}

const ChatRuntimeProvider = memo(function ChatRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const adapter = useBackendThreadListAdapter();
  const runtime = useRemoteThreadListRuntime({
    adapter,
    runtimeHook: useChatThreadRuntime,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
});

export { ChatRuntimeProvider };

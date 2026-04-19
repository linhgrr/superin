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
  return useLangGraphRuntime({
    load: async (externalId) => chatApi.loadLangGraphThread(externalId),
    stream: async function* (messages, { abortSignal, initialize }) {
      const { externalId, remoteId } = await initialize();
      const threadId = externalId ?? remoteId;

      yield* chatApi.streamLangGraph({
        threadId,
        messages,
        abortSignal,
      });
    },
    eventHandlers: {
      onError: (error) => {
        console.error("[ChatRuntime]", error);
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

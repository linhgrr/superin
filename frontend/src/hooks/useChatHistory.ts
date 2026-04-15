/**
 * useChatHistory — SWR-backed thread history fetcher.
 */

import useSWR from "swr";

import { chatApi, type ChatMessage } from "@/api/chat";
import { swrConfig } from "@/lib/swr";

export interface UseChatHistoryReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useChatHistory(threadId: string): UseChatHistoryReturn {
  const historySwr = useSWR(
    threadId ? ["chat/history", threadId] : null,
    () => chatApi.getHistory(threadId),
    {
      ...swrConfig,
      keepPreviousData: false,
      revalidateOnFocus: false,
    }
  );

  return {
    messages: historySwr.data?.messages ?? [],
    loading: historySwr.isLoading,
    error: historySwr.error instanceof Error ? historySwr.error.message : null,
    reload: () => {
      void historySwr.mutate();
    },
  };
}

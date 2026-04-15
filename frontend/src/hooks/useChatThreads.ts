import useSWR from "swr";

import type { ChatThreadMeta } from "@/api/chat";
import { chatApi } from "@/api/chat";
import { swrConfig } from "@/lib/swr";

export interface UseChatThreadsReturn {
  threads: ChatThreadMeta[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useChatThreads(): UseChatThreadsReturn {
  const threadsSwr = useSWR(
    "chat/threads",
    () => chatApi.getThreads(),
    {
      ...swrConfig,
      revalidateOnFocus: false,
    }
  );

  return {
    threads: threadsSwr.data?.threads ?? [],
    loading: threadsSwr.isLoading,
    error: threadsSwr.error instanceof Error ? threadsSwr.error.message : null,
    reload: () => {
      void threadsSwr.mutate();
    },
  };
}

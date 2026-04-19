import { ThreadListItemPrimitive, ThreadListPrimitive } from "@assistant-ui/react";
import { useAuiState } from "@assistant-ui/react";

import { DynamicIcon } from "@/lib/icon-resolver";

import { useChatThreads } from "@/hooks/useChatThreads";

interface ThreadHistorySidebarProps {
  onClose: () => void;
}

export default function ThreadHistorySidebar({
  onClose,
}: ThreadHistorySidebarProps) {
  const { threads, loading, error } = useChatThreads();
  const knownThreads = new Map(
    threads.map((thread) => [thread.threadId, thread]),
  );
  const isThreadListLoading = useAuiState((state) => state.threads.isLoading);

  return (
    <div className="chat-history-sidebar">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">History</span>
        <button onClick={onClose} className="chat-icon-btn" aria-label="Close history">
          <DynamicIcon name="X" size={16} />
        </button>
      </div>

      {loading || isThreadListLoading ? (
        <div className="text-muted text-xs">Loading…</div>
      ) : error ? (
        <div className="text-muted text-xs">Failed to load history.</div>
      ) : threads.length === 0 ? (
        <div className="text-muted text-xs">No conversations yet.</div>
      ) : (
        <ThreadListPrimitive.Root className="flex flex-col gap-1">
          <ThreadListPrimitive.Items>
            {({ threadListItem }) => {
              const thread = knownThreads.get(threadListItem.remoteId ?? threadListItem.id);
              const title = thread?.title || threadListItem.title || "New conversation";
              const preview = thread?.preview || "—";

              return (
                <ThreadListItemPrimitive.Root className="thread-history-item text-left">
                  <ThreadListItemPrimitive.Trigger className="block w-full text-left">
                    <div className="thread-history-title truncate">
                      {title}
                    </div>
                    <div className="thread-history-preview truncate">
                      {preview}
                    </div>
                  </ThreadListItemPrimitive.Trigger>
                </ThreadListItemPrimitive.Root>
              );
            }}
          </ThreadListPrimitive.Items>
        </ThreadListPrimitive.Root>
      )}
    </div>
  );
}

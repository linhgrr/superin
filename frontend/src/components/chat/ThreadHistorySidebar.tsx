import { DynamicIcon } from "@/lib/icon-resolver";

import { useChatThreads } from "@/hooks/useChatThreads";

interface ThreadHistorySidebarProps {
  onClose: () => void;
  onSelectThread: (threadId: string) => void;
}

export default function ThreadHistorySidebar({
  onClose,
  onSelectThread,
}: ThreadHistorySidebarProps) {
  const { threads, loading, error } = useChatThreads();

  return (
    <div className="chat-history-sidebar">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">History</span>
        <button onClick={onClose} className="chat-icon-btn" aria-label="Close history">
          <DynamicIcon name="X" size={16} />
        </button>
      </div>

      {loading ? (
        <div className="text-muted text-xs">Loading…</div>
      ) : error ? (
        <div className="text-muted text-xs">Failed to load history.</div>
      ) : threads.length === 0 ? (
        <div className="text-muted text-xs">No conversations yet.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {threads.map((thread) => (
            <button
              key={thread.threadId}
              onClick={() => onSelectThread(thread.threadId)}
              className="thread-history-item text-left"
            >
              <div className="thread-history-title truncate">
                {thread.title || "New conversation"}
              </div>
              <div className="thread-history-preview truncate">
                {thread.preview || "—"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

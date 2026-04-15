import { DynamicIcon } from "@/lib/icon-resolver";

interface ChatHeaderProps {
  onNewChat: () => void;
  onOpenHistory: () => void;
}

export default function ChatHeader({ onNewChat, onOpenHistory }: ChatHeaderProps) {
  return (
    <div className="chat-header">
      <div className="flex items-center gap-2">
        <DynamicIcon name="Sparkles" size={16} className="text-primary" />
        <span className="chat-header-title">Superin AI</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onNewChat} className="chat-icon-btn" aria-label="New chat" title="New chat">
          <DynamicIcon name="Plus" size={16} />
        </button>
        <button onClick={onOpenHistory} className="chat-icon-btn" aria-label="History" title="History">
          <DynamicIcon name="History" size={16} />
        </button>
      </div>
    </div>
  );
}

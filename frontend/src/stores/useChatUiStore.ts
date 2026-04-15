import { create } from "zustand";

function generateThreadId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

interface ChatUiState {
  activeThreadId: string;
  showHistory: boolean;
  createNewThread: () => void;
  switchThread: (threadId: string) => void;
  openHistory: () => void;
  closeHistory: () => void;
  toggleHistory: () => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  activeThreadId: generateThreadId(),
  showHistory: false,
  createNewThread: () => {
    set({
      activeThreadId: generateThreadId(),
      showHistory: false,
    });
  },
  switchThread: (threadId) => {
    const nextThreadId = threadId.trim();
    if (!nextThreadId) return;

    set({
      activeThreadId: nextThreadId,
      showHistory: false,
    });
  },
  openHistory: () => {
    set({ showHistory: true });
  },
  closeHistory: () => {
    set({ showHistory: false });
  },
  toggleHistory: () => {
    set((state) => ({ showHistory: !state.showHistory }));
  },
}));

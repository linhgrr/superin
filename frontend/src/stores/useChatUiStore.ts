import { create } from "zustand";

interface ChatUiState {
  showHistory: boolean;
  openHistory: () => void;
  closeHistory: () => void;
  toggleHistory: () => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  showHistory: false,
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

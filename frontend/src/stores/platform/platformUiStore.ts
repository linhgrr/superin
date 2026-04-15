import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants";

const MAX_RECENT_COMMANDS = 5;

interface PlatformUiState {
  isAddWidgetDialogOpen: boolean;
  isCommandPaletteOpen: boolean;
  recentCommandIds: string[];
  clearRecentCommands: () => void;
  closeAddWidgetDialog: () => void;
  closeCommandPalette: () => void;
  openAddWidgetDialog: () => void;
  openCommandPalette: () => void;
  trackRecentCommand: (commandId: string) => void;
  toggleCommandPalette: () => void;
}

export const usePlatformUiStore = create<PlatformUiState>()(
  persist(
    (set, get) => ({
      isAddWidgetDialogOpen: false,
      isCommandPaletteOpen: false,
      recentCommandIds: [],
      clearRecentCommands: () => {
        set({ recentCommandIds: [] });
      },
      closeAddWidgetDialog: () => {
        set({ isAddWidgetDialogOpen: false });
      },
      closeCommandPalette: () => {
        set({ isCommandPaletteOpen: false });
      },
      openAddWidgetDialog: () => {
        set({ isAddWidgetDialogOpen: true });
      },
      openCommandPalette: () => {
        set({ isCommandPaletteOpen: true });
      },
      trackRecentCommand: (commandId) => {
        const recentCommandIds = get().recentCommandIds;
        set({
          recentCommandIds: [commandId, ...recentCommandIds.filter((id) => id !== commandId)].slice(
            0,
            MAX_RECENT_COMMANDS
          ),
        });
      },
      toggleCommandPalette: () => {
        set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen }));
      },
    }),
    {
      name: STORAGE_KEYS.RECENT_COMMANDS,
      partialize: (state) => ({ recentCommandIds: state.recentCommandIds }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const platformUiSelectors = {
  isAddWidgetDialogOpen: (state: PlatformUiState) => state.isAddWidgetDialogOpen,
  isCommandPaletteOpen: (state: PlatformUiState) => state.isCommandPaletteOpen,
  recentCommandIds: (state: PlatformUiState) => state.recentCommandIds,
  clearRecentCommands: (state: PlatformUiState) => state.clearRecentCommands,
  closeAddWidgetDialog: (state: PlatformUiState) => state.closeAddWidgetDialog,
  closeCommandPalette: (state: PlatformUiState) => state.closeCommandPalette,
  openAddWidgetDialog: (state: PlatformUiState) => state.openAddWidgetDialog,
  openCommandPalette: (state: PlatformUiState) => state.openCommandPalette,
  trackRecentCommand: (state: PlatformUiState) => state.trackRecentCommand,
  toggleCommandPalette: (state: PlatformUiState) => state.toggleCommandPalette,
} as const;

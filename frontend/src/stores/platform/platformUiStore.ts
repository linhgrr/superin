import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

const MAX_RECENT_COMMANDS = 5;

interface PlatformUiState {
  isAddWidgetDialogOpen: boolean;
  isCommandPaletteOpen: boolean;
  isDesktopSidebarCollapsed: boolean;
  recentCommandIds: string[];
  clearRecentCommands: () => void;
  closeAddWidgetDialog: () => void;
  closeCommandPalette: () => void;
  collapseDesktopSidebar: () => void;
  expandDesktopSidebar: () => void;
  openAddWidgetDialog: () => void;
  openCommandPalette: () => void;
  setDesktopSidebarCollapsed: (isCollapsed: boolean) => void;
  trackRecentCommand: (commandId: string) => void;
  toggleCommandPalette: () => void;
  toggleDesktopSidebar: () => void;
}

export const usePlatformUiStore = create<PlatformUiState>()(
  persist(
    (set, get) => ({
      isAddWidgetDialogOpen: false,
      isCommandPaletteOpen: false,
      isDesktopSidebarCollapsed: false,
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
      collapseDesktopSidebar: () => {
        set({ isDesktopSidebarCollapsed: true });
      },
      expandDesktopSidebar: () => {
        set({ isDesktopSidebarCollapsed: false });
      },
      openAddWidgetDialog: () => {
        set({ isAddWidgetDialogOpen: true });
      },
      openCommandPalette: () => {
        set({ isCommandPaletteOpen: true });
      },
      setDesktopSidebarCollapsed: (isDesktopSidebarCollapsed) => {
        set({ isDesktopSidebarCollapsed });
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
      toggleDesktopSidebar: () => {
        set((state) => ({ isDesktopSidebarCollapsed: !state.isDesktopSidebarCollapsed }));
      },
    }),
    {
      name: STORAGE_KEYS.PLATFORM_UI,
      partialize: (state) => ({
        isDesktopSidebarCollapsed: state.isDesktopSidebarCollapsed,
        recentCommandIds: state.recentCommandIds,
      }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const platformUiSelectors = {
  isAddWidgetDialogOpen: (state: PlatformUiState) => state.isAddWidgetDialogOpen,
  isCommandPaletteOpen: (state: PlatformUiState) => state.isCommandPaletteOpen,
  isDesktopSidebarCollapsed: (state: PlatformUiState) => state.isDesktopSidebarCollapsed,
  recentCommandIds: (state: PlatformUiState) => state.recentCommandIds,
  clearRecentCommands: (state: PlatformUiState) => state.clearRecentCommands,
  closeAddWidgetDialog: (state: PlatformUiState) => state.closeAddWidgetDialog,
  closeCommandPalette: (state: PlatformUiState) => state.closeCommandPalette,
  collapseDesktopSidebar: (state: PlatformUiState) => state.collapseDesktopSidebar,
  expandDesktopSidebar: (state: PlatformUiState) => state.expandDesktopSidebar,
  openAddWidgetDialog: (state: PlatformUiState) => state.openAddWidgetDialog,
  openCommandPalette: (state: PlatformUiState) => state.openCommandPalette,
  setDesktopSidebarCollapsed: (state: PlatformUiState) => state.setDesktopSidebarCollapsed,
  trackRecentCommand: (state: PlatformUiState) => state.trackRecentCommand,
  toggleCommandPalette: (state: PlatformUiState) => state.toggleCommandPalette,
  toggleDesktopSidebar: (state: PlatformUiState) => state.toggleDesktopSidebar,
} as const;

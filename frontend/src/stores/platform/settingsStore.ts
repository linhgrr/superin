import { create } from "zustand";

import { updateUserSettings } from "@/api/auth";
import { STORAGE_KEYS } from "@/constants";
import { resolveTheme } from "@/lib/theme";
import {
  DEFAULT_SETTINGS,
  type SettingsState,
  type Theme,
} from "@/pages/settings/settings-constants";

export type SettingsTabId = "profile" | "appearance" | "notifications" | "keyboard";

interface SaveSettingsResult {
  serverSyncFailed: boolean;
  timezoneSynced: boolean;
}

interface SettingsStoreState {
  isSaving: boolean;
  settings: SettingsState;
  internal_setSettings: (settings: SettingsState) => void;
  saveSettings: (updates: Partial<SettingsState>) => Promise<SaveSettingsResult>;
  syncSettingsFromStorage: (raw?: string | null) => void;
  syncTimezoneFromUser: (timezone: string | null | undefined) => void;
  toggleTheme: () => void;
}

function readStoredSettings(raw?: string | null): SettingsState {
  try {
    const storedRaw = raw ?? localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (!storedRaw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(storedRaw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeStoredSettings(settings: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
  } catch (error: unknown) {
    console.error("Failed to persist settings to localStorage", error);
  }
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  isSaving: false,
  settings: readStoredSettings(),
  internal_setSettings: (settings) => {
    set({ settings });
    writeStoredSettings(settings);
  },
  saveSettings: async (updates) => {
    set({ isSaving: true });
    const updatedSettings = { ...get().settings, ...updates };
    get().internal_setSettings(updatedSettings);

    let timezoneSynced = true;

    try {
      if (updates.timezone) {
        await updateUserSettings({ settings: { timezone: updates.timezone } });
      }
    } catch {
      timezoneSynced = false;
    } finally {
      set({ isSaving: false });
    }

    return {
      serverSyncFailed: !timezoneSynced,
      timezoneSynced,
    };
  },
  syncSettingsFromStorage: (raw) => {
    set({ settings: readStoredSettings(raw) });
  },
  syncTimezoneFromUser: (timezone) => {
    if (!timezone || timezone === get().settings.timezone) return;

    const updatedSettings = { ...get().settings, timezone };
    get().internal_setSettings(updatedSettings);
  },
  toggleTheme: () => {
    const currentTheme = get().settings.theme;
    const nextTheme: Theme = resolveTheme(currentTheme) === "dark" ? "light" : "dark";
    const updatedSettings = { ...get().settings, theme: nextTheme };
    get().internal_setSettings(updatedSettings);
  },
}));

export const settingsSelectors = {
  isSaving: (state: SettingsStoreState) => state.isSaving,
  settings: (state: SettingsStoreState) => state.settings,
  theme: (state: SettingsStoreState) => state.settings.theme,
  saveSettings: (state: SettingsStoreState) => state.saveSettings,
  syncSettingsFromStorage: (state: SettingsStoreState) => state.syncSettingsFromStorage,
  syncTimezoneFromUser: (state: SettingsStoreState) => state.syncTimezoneFromUser,
  toggleTheme: (state: SettingsStoreState) => state.toggleTheme,
} as const;

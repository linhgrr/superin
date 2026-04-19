import { create } from "zustand";
import { z } from "zod";

import { updateUserSettings } from "@/api/auth";
import { STORAGE_KEYS } from "@/constants/storage";
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

const storedSettingsSchema = z
  .object({
    animations: z.boolean(),
    density: z.enum(["comfortable", "compact", "spacious"]),
    emailNotifications: z.boolean(),
    marketingEmails: z.boolean(),
    pushNotifications: z.boolean(),
    theme: z.enum(["light", "dark", "system"]),
    timezone: z.string().min(1),
  })
  .partial();

function getSettingsStorageValue(raw?: string | null): string | null {
  if (raw !== undefined) {
    return raw;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
}

export function readStoredSettings(raw?: string | null): SettingsState {
  const storedRaw = getSettingsStorageValue(raw);
  if (!storedRaw) return DEFAULT_SETTINGS;

  let parsed: unknown;

  try {
    parsed = JSON.parse(storedRaw);
  } catch (error: unknown) {
    console.error("Failed to parse stored settings", error);
    return DEFAULT_SETTINGS;
  }

  const result = storedSettingsSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Stored settings payload is invalid", result.error);
    return DEFAULT_SETTINGS;
  }

  return { ...DEFAULT_SETTINGS, ...result.data };
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
    const previousSettings = get().settings;
    const updatedSettings = { ...previousSettings, ...updates };
    get().internal_setSettings(updatedSettings);

    let timezoneSynced = true;

    try {
      if (updates.timezone) {
        await updateUserSettings({ settings: { timezone: updates.timezone } });
      }
    } catch (error: unknown) {
      console.error("Failed to sync settings to server", error);
      timezoneSynced = false;

      if (updates.timezone && previousSettings.timezone !== updatedSettings.timezone) {
        get().internal_setSettings({
          ...get().settings,
          timezone: previousSettings.timezone,
        });
      }
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

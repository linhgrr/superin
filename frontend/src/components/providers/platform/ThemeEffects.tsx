import { useEffect } from "react";

import { STORAGE_KEYS } from "@/constants";
import { applyTheme } from "@/lib/theme";
import { settingsSelectors, useSettingsStore } from "@/stores/platform/settingsStore";

export function ThemeEffects() {
  const theme = useSettingsStore(settingsSelectors.theme);
  const syncSettingsFromStorage = useSettingsStore(settingsSelectors.syncSettingsFromStorage);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (useSettingsStore.getState().settings.theme === "system") {
        applyTheme("system");
      }
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onSystemThemeChange);
      return () => media.removeEventListener("change", onSystemThemeChange);
    }

    media.addListener(onSystemThemeChange);
    return () => media.removeListener(onSystemThemeChange);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.USER_SETTINGS) return;
      syncSettingsFromStorage(event.newValue);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [syncSettingsFromStorage]);

  return null;
}

import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ROUTES } from "@/constants/routes";
import { settingsSelectors, useSettingsStore } from "@/stores/platform/settingsStore";
import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";

export function PlatformRouteEffects() {
  const location = useLocation();
  const closeAddWidgetDialog = usePlatformUiStore(platformUiSelectors.closeAddWidgetDialog);
  const closeCommandPalette = usePlatformUiStore(platformUiSelectors.closeCommandPalette);
  const openAddWidgetDialog = usePlatformUiStore(platformUiSelectors.openAddWidgetDialog);
  const toggleCommandPalette = usePlatformUiStore(platformUiSelectors.toggleCommandPalette);
  const toggleTheme = useSettingsStore(settingsSelectors.toggleTheme);
  const navigate = useNavigate();
  const pendingShortcutRef = useRef<string | null>(null);
  const pendingShortcutTimeoutRef = useRef<number | null>(null);
  const shouldOpenAddWidgetRef = useRef(false);

  const clearPendingShortcut = useCallback(() => {
    pendingShortcutRef.current = null;
    if (pendingShortcutTimeoutRef.current !== null) {
      window.clearTimeout(pendingShortcutTimeoutRef.current);
      pendingShortcutTimeoutRef.current = null;
    }
  }, []);

  const queueShortcut = useCallback(
    (key: string) => {
      clearPendingShortcut();
      pendingShortcutRef.current = key;
      pendingShortcutTimeoutRef.current = window.setTimeout(() => {
        pendingShortcutRef.current = null;
        pendingShortcutTimeoutRef.current = null;
      }, 700);
    },
    [clearPendingShortcut]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void import("@/components/providers/command-palette/CommandPalette");
    }, 200);

    return () => {
      window.clearTimeout(handle);
    };
  }, []);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        toggleCommandPalette();
        clearPendingShortcut();
        return;
      }

      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      clearPendingShortcut();
      navigate(ROUTES.SETTINGS_TAB("keyboard"));
      return;
    };

    const handleShortcutSequences = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target) ||
        event.key.length !== 1
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const pendingShortcut = pendingShortcutRef.current;

      if (!pendingShortcut) {
        if (key === "g" || key === "a" || key === "t") {
          queueShortcut(key);
        }
        return;
      }

      clearPendingShortcut();

      if (pendingShortcut === "g" && key === "d") {
        event.preventDefault();
        navigate(ROUTES.DASHBOARD);
        return;
      }

      if (pendingShortcut === "g" && key === "s") {
        event.preventDefault();
        navigate(ROUTES.STORE);
        return;
      }

      if (pendingShortcut === "a" && key === "w") {
        event.preventDefault();
        if (location.pathname === ROUTES.DASHBOARD) {
          openAddWidgetDialog();
        } else {
          shouldOpenAddWidgetRef.current = true;
          navigate(ROUTES.DASHBOARD);
        }
        return;
      }

      if (pendingShortcut === "t" && key === "t") {
        event.preventDefault();
        toggleTheme();
        return;
      }

      if (key === "g" || key === "a" || key === "t") {
        queueShortcut(key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleShortcutSequences);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleShortcutSequences);
    };
  }, [
    clearPendingShortcut,
    location.pathname,
    navigate,
    openAddWidgetDialog,
    queueShortcut,
    toggleCommandPalette,
    toggleTheme,
  ]);

  useEffect(() => {
    closeCommandPalette();

    if (location.pathname !== ROUTES.DASHBOARD) {
      closeAddWidgetDialog();
    }

    if (location.pathname === ROUTES.DASHBOARD && shouldOpenAddWidgetRef.current) {
      shouldOpenAddWidgetRef.current = false;
      openAddWidgetDialog();
    }
  }, [closeAddWidgetDialog, closeCommandPalette, location.pathname, openAddWidgetDialog]);

  useEffect(() => {
    return () => {
      clearPendingShortcut();
    };
  }, [clearPendingShortcut]);

  return null;
}

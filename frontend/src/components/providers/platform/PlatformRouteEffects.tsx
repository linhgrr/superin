import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ROUTES } from "@/constants";
import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";

export function PlatformRouteEffects() {
  const location = useLocation();
  const closeAddWidgetDialog = usePlatformUiStore(platformUiSelectors.closeAddWidgetDialog);
  const closeCommandPalette = usePlatformUiStore(platformUiSelectors.closeCommandPalette);
  const toggleCommandPalette = usePlatformUiStore(platformUiSelectors.toggleCommandPalette);
  const navigate = useNavigate();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void import("@/components/providers/command-palette/CommandPalette");
    }, 200);

    return () => {
      window.clearTimeout(handle);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        toggleCommandPalette();
      }

      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      ) {
        return;
      }

      event.preventDefault();
      navigate(ROUTES.SETTINGS_TAB("keyboard"));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, toggleCommandPalette]);

  useEffect(() => {
    closeCommandPalette();

    if (location.pathname !== ROUTES.DASHBOARD) {
      closeAddWidgetDialog();
    }
  }, [closeAddWidgetDialog, closeCommandPalette, location.pathname]);

  return null;
}

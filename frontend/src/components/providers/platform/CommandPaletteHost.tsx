import { lazy, Suspense } from "react";

import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";

const CommandPalette = lazy(async () => {
  const module = await import("@/components/providers/command-palette/CommandPalette");
  return { default: module.CommandPalette };
});

function CommandPaletteFallback() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "oklch(0 0 0 / 0.35)",
      }}
    />
  );
}

export function CommandPaletteHost() {
  const isOpen = usePlatformUiStore(platformUiSelectors.isCommandPaletteOpen);
  const closeCommandPalette = usePlatformUiStore(platformUiSelectors.closeCommandPalette);

  if (!isOpen) return null;

  return (
    <Suspense fallback={<CommandPaletteFallback />}>
      <CommandPalette onClose={closeCommandPalette} />
    </Suspense>
  );
}

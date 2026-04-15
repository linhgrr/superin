import { CommandPaletteHost } from "./CommandPaletteHost";
import { PlatformRouteEffects } from "./PlatformRouteEffects";
import { WorkspaceEffects } from "./WorkspaceEffects";

export function ProtectedShellRuntime() {
  return (
    <>
      <WorkspaceEffects />
      <PlatformRouteEffects />
      <CommandPaletteHost />
    </>
  );
}

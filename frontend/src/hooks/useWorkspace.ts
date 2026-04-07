/**
 * useWorkspace — extracted hook so WorkspaceProvider only exports the component.
 */
import { useContext } from "react";
import { WorkspaceContext } from "@/components/providers/workspace-context";
import type { WorkspaceContextValue } from "@/components/providers/workspace-context";

export type { WorkspaceContextValue };

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  }
  return context;
}

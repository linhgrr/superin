/**
 * WorkspaceContext — shared by WorkspaceProvider and useWorkspace.
 */
import { createContext } from "react";
import type { WorkspaceContextValue } from "@/components/providers/WorkspaceProvider";

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export type { WorkspaceContextValue };

/**
 * Workspace snapshot persistence — pure functions, no React.
 */

import type { WorkspaceBootstrap } from "@/types/generated";
import { STORAGE_KEYS } from "@/constants/storage";

const WORKSPACE_CACHE_VERSION = 1;

interface PersistedWorkspaceSnapshot {
  userId: string;
  version: number;
  storedAt: number;
  workspace: WorkspaceBootstrap;
}

export function readWorkspaceSnapshot(userId: string): WorkspaceBootstrap | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.WORKSPACE_SNAPSHOT);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedWorkspaceSnapshot;
    if (
      parsed.version !== WORKSPACE_CACHE_VERSION ||
      parsed.userId !== userId ||
      !parsed.workspace
    ) {
      return null;
    }

    return parsed.workspace;
  } catch (error: unknown) {
    console.error("Failed to read workspace snapshot", error);
    return null;
  }
}

export function writeWorkspaceSnapshot(userId: string, workspace: WorkspaceBootstrap): void {
  try {
    const payload: PersistedWorkspaceSnapshot = {
      userId,
      version: WORKSPACE_CACHE_VERSION,
      storedAt: Date.now(),
      workspace,
    };
    sessionStorage.setItem(STORAGE_KEYS.WORKSPACE_SNAPSHOT, JSON.stringify(payload));
  } catch (error: unknown) {
    console.error("Failed to write workspace snapshot", error);
  }
}

export function clearWorkspaceSnapshot(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.WORKSPACE_SNAPSHOT);
  } catch (error: unknown) {
    console.error("Failed to clear workspace snapshot", error);
  }
}

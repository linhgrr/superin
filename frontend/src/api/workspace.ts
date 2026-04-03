import type { WorkspaceBootstrap } from "@/types/generated/api";
import { API_PATHS } from "@/constants";
import { api } from "./client";

export async function getWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  return api.get<WorkspaceBootstrap>(API_PATHS.WORKSPACE_BOOTSTRAP);
}

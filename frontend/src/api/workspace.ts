import type { WorkspaceBootstrap } from "@/types/generated";
import { API_PATHS } from "@/constants";
import { api } from "./axios";

export async function getWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  return api.get<WorkspaceBootstrap>(API_PATHS.WORKSPACE_BOOTSTRAP);
}

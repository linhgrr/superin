/**
 * App Catalog API — browse, install, uninstall apps, widget preferences, categories.
 */

import type {
  AppCatalogEntry,
  AppInstallRequest,
  AppUninstallRequest,
  WidgetPreferenceSchema,
  PreferenceUpdate,
} from "@/types/generated/api";
import { api } from "./client";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  auto_discovered?: boolean;
}

// GET /api/catalog — all apps with is_installed flag
export async function getCatalog(): Promise<AppCatalogEntry[]> {
  return api.get<AppCatalogEntry[]>("/api/catalog");
}

// GET /api/catalog/categories — all categories with metadata
export async function getCategories(): Promise<Category[]> {
  return api.get<Category[]>("/api/catalog/categories");
}

// POST /api/catalog/install
export async function installApp(payload: AppInstallRequest): Promise<void> {
  return api.post<void>("/api/catalog/install", payload);
}

// POST /api/catalog/uninstall
export async function uninstallApp(
  payload: AppUninstallRequest
): Promise<void> {
  return api.post<void>("/api/catalog/uninstall", payload);
}

// GET /api/catalog/preferences — all prefs for current user
export async function getAllPreferences(): Promise<WidgetPreferenceSchema[]> {
  return api.get<WidgetPreferenceSchema[]>("/api/catalog/preferences");
}

// GET /api/catalog/preferences/{appId}
export async function getPreferences(
  appId: string
): Promise<WidgetPreferenceSchema[]> {
  return api.get<WidgetPreferenceSchema[]>(
    `/api/catalog/preferences/${appId}`
  );
}

// PUT /api/catalog/preferences/{appId}
export async function updatePreferences(
  appId: string,
  updates: PreferenceUpdate[]
): Promise<void> {
  return api.put<void>(`/api/catalog/preferences/${appId}`, updates);
}

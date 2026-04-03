/**
 * App Catalog API — browse, install, uninstall apps, widget preferences, categories.
 *
 * Uses centralized constants for all API paths.
 */

import type {
  AppCatalogEntry,
  AppInstallRequest,
  AppUninstallRequest,
  WidgetPreferenceSchema,
  PreferenceUpdate,
} from "@/types/generated/api";
import { API_PATHS } from "@/constants";
import { api } from "./client";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  auto_discovered?: boolean;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export async function getCatalog(): Promise<AppCatalogEntry[]> {
  return api.get<AppCatalogEntry[]>(API_PATHS.CATALOG_APPS);
}

export async function getCategories(): Promise<Category[]> {
  return api.get<Category[]>(API_PATHS.CATALOG_CATEGORIES);
}

// ─── Install / Uninstall ────────────────────────────────────────────────────────

export async function installApp(payload: AppInstallRequest): Promise<void> {
  return api.post<void>(API_PATHS.CATALOG_INSTALL, payload);
}

export async function uninstallApp(payload: AppUninstallRequest): Promise<void> {
  return api.post<void>(API_PATHS.CATALOG_UNINSTALL, payload);
}

// ─── Preferences ───────────────────────────────────────────────────────────────

export async function getAllPreferences(): Promise<WidgetPreferenceSchema[]> {
  return api.get<WidgetPreferenceSchema[]>(API_PATHS.CATALOG_ALL_PREFERENCES);
}

export async function getPreferences(
  appId: string
): Promise<WidgetPreferenceSchema[]> {
  return api.get<WidgetPreferenceSchema[]>(API_PATHS.CATALOG_PREFERENCES(appId));
}

export async function updatePreferences(
  appId: string,
  updates: PreferenceUpdate[]
): Promise<void> {
  return api.put<void>(API_PATHS.CATALOG_PREFERENCES(appId), updates);
}

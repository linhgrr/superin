import type { AppCatalogEntry, AppCategoryRead } from "@/types/generated";
import { getCatalog, getCategories, installApp, uninstallApp } from "@/api/catalog";
import { ROUTES } from "@/constants/routes";
import { STORAGE_KEYS } from "@/constants/storage";

export interface PersistedCatalogSnapshot {
  catalog: AppCatalogEntry[];
  storedAt: number;
  version: 1;
}

export const STORE_CATALOG_CACHE_VERSION = 1;
export const DEFAULT_STORE_CATEGORY = "all";
export const DEFAULT_STORE_VIEW_MODE = "grid";

export type StoreViewMode = "grid" | "list";

export function readCatalogSnapshot(): AppCatalogEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.STORE_CATALOG_SNAPSHOT);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedCatalogSnapshot;
    if (parsed.version !== STORE_CATALOG_CACHE_VERSION || !Array.isArray(parsed.catalog)) return [];
    return parsed.catalog;
  } catch {
    return [];
  }
}

export function writeCatalogSnapshot(catalog: AppCatalogEntry[]): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEYS.STORE_CATALOG_SNAPSHOT,
      JSON.stringify({ catalog, storedAt: Date.now(), version: STORE_CATALOG_CACHE_VERSION }),
    );
  } catch {
    // Non-critical
  }
}

export function formatCategoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

export function normalizeStoreViewMode(value: string | null): StoreViewMode {
  return value === "list" ? "list" : DEFAULT_STORE_VIEW_MODE;
}

export async function fetchStoreCatalogData() {
  const [catalog, categories] = await Promise.all([getCatalog(), getCategories()]);
  return { catalog, categories };
}

export function buildCategoryMap(categories: AppCategoryRead[]) {
  const map: Record<string, AppCategoryRead> = {};

  for (const category of categories) {
    map[category.name.toLowerCase()] = category;
    map[category.id.toLowerCase()] = category;
  }

  return map;
}

export function getCategoryResolver(categoryMap: Record<string, AppCategoryRead>) {
  return (categoryId: string): AppCategoryRead =>
    categoryMap[categoryId.toLowerCase()] ?? {
      id: categoryId,
      name: formatCategoryLabel(categoryId),
      icon: "Package",
      color: "oklch(0.5 0.05 80)",
      order: 999,
    };
}

export function getAvailableStoreCategories(
  categories: AppCategoryRead[],
  catalog: AppCatalogEntry[],
) {
  const catalogCategories = new Set(catalog.map((app) => app.category.toLowerCase()));
  const knownCategories = new Set(categories.map((category) => category.name.toLowerCase()));
  return [DEFAULT_STORE_CATEGORY, ...Array.from(new Set([...knownCategories, ...catalogCategories])).sort()];
}

export function filterCatalogApps({
  catalog,
  filter,
  searchQuery,
}: {
  catalog: AppCatalogEntry[];
  filter: string;
  searchQuery: string;
}) {
  return catalog.filter((app) => {
    const matchCategory = filter === DEFAULT_STORE_CATEGORY || app.category.toLowerCase() === filter.toLowerCase();
    const matchSearch =
      searchQuery === "" ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });
}

export async function toggleStoreAppInstallation({
  app,
  isInstalled,
}: {
  app: AppCatalogEntry;
  isInstalled: boolean;
}) {
  if (isInstalled) {
    await uninstallApp({ app_id: app.id });
    return;
  }

  await installApp({ app_id: app.id });
}

export function getStoreActionRoute(appId: string) {
  return ROUTES.APP_DETAIL(appId);
}

export function getStoreErrorDetail(error: unknown) {
  const apiError = error as {
    message?: string;
    response?: {
      data?: {
        detail?: string;
        error?: string;
      };
    };
  };

  return (
    apiError.response?.data?.detail ??
    apiError.response?.data?.error ??
    apiError.message ??
    "Please try again later"
  );
}

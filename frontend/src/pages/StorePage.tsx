/**
 * StorePage — app catalog with search, category filters, and grid/list view.
 *
 * Architecture:
 *   StorePage
 *   ├── StoreFilters        (search + category chips + view toggle)
 *   └── AppCard / AppListItem  (rendered per catalog entry)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import type { AppCatalogEntry, AppCategoryRead } from "@/types/generated";
import { useToast } from "@/components/providers/ToastProvider";
import { ROUTES } from "@/constants/routes";
import {
  StorePageEmpty,
  StorePageFilters,
  StorePageLoading,
  StorePageResults,
} from "@/pages/StorePageSections";
import { useWorkspaceStore } from "@/stores/platform/workspaceStore";
import {
  buildCategoryMap,
  DEFAULT_STORE_CATEGORY,
  fetchStoreCatalogData,
  filterCatalogApps,
  getAvailableStoreCategories,
  getCategoryResolver,
  getStoreActionRoute,
  getStoreErrorDetail,
  normalizeStoreViewMode,
  readCatalogSnapshot,
  toggleStoreAppInstallation,
  type StoreViewMode,
  writeCatalogSnapshot,
} from "./store-page-state";

export default function StorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { installedAppIds, refreshWorkspace, setAppInstalled } = useWorkspaceStore(
    useShallow((state) => ({
      installedAppIds: state.installedAppIds,
      refreshWorkspace: state.refreshWorkspace,
      setAppInstalled: state.setAppInstalled,
    }))
  );
  const toast = useToast();

  const [catalog, setCatalog] = useState<AppCatalogEntry[]>(readCatalogSnapshot);
  const [isCatalogLoading, setIsCatalogLoading] = useState(() => readCatalogSnapshot().length === 0);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<AppCategoryRead[]>([]);

  // Fetch catalog + categories in parallel
  useEffect(() => {
    void fetchStoreCatalogData()
      .then(({ catalog: catalogData, categories: categoriesData }) => {
        setCatalog(catalogData);
        setCategories(categoriesData);
        writeCatalogSnapshot(catalogData);
      })
      .finally(() => {
        setIsCatalogLoading(false);
      });
  }, []);

  const mergedCatalog = useMemo(
    () =>
      catalog.map((app) => ({ ...app, is_installed: installedAppIds.has(app.id) })),
    [catalog, installedAppIds]
  );

  const categoryMap = useMemo(() => buildCategoryMap(categories), [categories]);
  const getCategory = useMemo(() => getCategoryResolver(categoryMap), [categoryMap]);

  const availableCategories = useMemo(() => {
    return getAvailableStoreCategories(categories, mergedCatalog);
  }, [categories, mergedCatalog]);

  const rawSearchQuery = searchParams.get("q") ?? "";
  const rawFilter = searchParams.get("category") ?? DEFAULT_STORE_CATEGORY;
  const searchQuery = rawSearchQuery.trim();
  const filter = availableCategories.some((category) => category === rawFilter.toLowerCase())
    ? rawFilter
    : DEFAULT_STORE_CATEGORY;
  const viewMode = normalizeStoreViewMode(searchParams.get("view"));

  const updateStoreSearchParams = useCallback(
    (updates: { category?: string; q?: string; view?: StoreViewMode }) => {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);

        if (updates.category !== undefined) {
          const nextCategory = updates.category.trim().toLowerCase();
          if (!nextCategory || nextCategory === DEFAULT_STORE_CATEGORY) {
            nextParams.delete("category");
          } else {
            nextParams.set("category", nextCategory);
          }
        }

        if (updates.q !== undefined) {
          const nextQuery = updates.q.trim();
          if (!nextQuery) {
            nextParams.delete("q");
          } else {
            nextParams.set("q", nextQuery);
          }
        }

        if (updates.view !== undefined) {
          if (updates.view === DEFAULT_STORE_VIEW_MODE) {
            nextParams.delete("view");
          } else {
            nextParams.set("view", updates.view);
          }
        }

        return nextParams;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const filtered = useMemo(
    () => filterCatalogApps({ catalog: mergedCatalog, filter, searchQuery }),
    [mergedCatalog, filter, searchQuery],
  );

  const handleToggle = async (app: AppCatalogEntry) => {
    if (installing.has(app.id)) return;
    setInstalling((current) => new Set([...current, app.id]));
    const nextInstalled = !app.is_installed;
    setAppInstalled(app, nextInstalled);

    try {
      await toggleStoreAppInstallation({
        app,
        isInstalled: app.is_installed,
      });

      if (app.is_installed) {
        toast.success(`${app.name} uninstalled`, {
          description: "The app has been removed from your workspace",
        });
      } else {
        toast.success(`${app.name} installed`, {
          description: "The app is now available in your workspace",
          action: {
            label: "Open",
            onClick: () => {
              window.location.href = getStoreActionRoute(app.id);
            },
          },
        });
      }
      await refreshWorkspace();
    } catch (error: unknown) {
      const detail = getStoreErrorDetail(error);
      if (typeof detail === "string" && detail.toLowerCase().includes("requires a paid subscription")) {
        toast.error(`Premium Required`, {
          description: `The ${app.name} app requires a Pro subscription to install.`,
          action: {
            label: "Upgrade",
            onClick: () => { window.location.href = ROUTES.BILLING; },
          },
        });
      } else {
        toast.error(`Failed to ${nextInstalled ? "install" : "uninstall"} ${app.name}`, {
          description: typeof detail === "string" ? detail : "Please try again later",
        });
      }
      setAppInstalled(app, app.is_installed); // revert
      await refreshWorkspace();
    } finally {
      setInstalling((current) => {
        const next = new Set(current);
        next.delete(app.id);
        return next;
      });
    }
  };

  if (isCatalogLoading && catalog.length === 0) {
    return <StorePageLoading />;
  }

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      <StorePageFilters
        searchQuery={rawSearchQuery}
        onSearchChange={(query) => updateStoreSearchParams({ q: query })}
        filter={filter}
        onFilterChange={(category) => updateStoreSearchParams({ category })}
        viewMode={viewMode}
        onViewModeChange={(mode) => updateStoreSearchParams({ view: mode })}
        availableCategories={availableCategories}
        getCategory={getCategory}
      />

      {filtered.length === 0 ? (
        <StorePageEmpty />
      ) : (
        <StorePageResults
          apps={filtered}
          getCategory={getCategory}
          installing={installing}
          onToggle={handleToggle}
          viewMode={viewMode}
        />
      )}
    </div>
  );
}

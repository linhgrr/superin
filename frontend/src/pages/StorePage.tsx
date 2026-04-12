/**
 * StorePage — app catalog with search, category filters, and grid/list view.
 *
 * Architecture:
 *   StorePage
 *   ├── StoreFilters        (search + category chips + view toggle)
 *   └── AppCard / AppListItem  (rendered per catalog entry)
 */

import { useEffect, useMemo, useState } from "react";
import type { AppCatalogEntry, AppCategoryRead } from "@/types/generated";
import { getCatalog, getCategories, installApp, uninstallApp } from "@/api/catalog";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ROUTES, STORAGE_KEYS } from "@/constants";
import AppCard from "@/components/store/AppCard";
import AppListItem from "@/components/store/AppListItem";
import StoreFilters from "@/components/store/StoreFilters";

interface PersistedCatalogSnapshot {
  catalog: AppCatalogEntry[];
  storedAt: number;
  version: 1;
}

const STORE_CATALOG_CACHE_VERSION = 1;

function readCatalogSnapshot(): AppCatalogEntry[] {
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

function writeCatalogSnapshot(catalog: AppCatalogEntry[]): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEYS.STORE_CATALOG_SNAPSHOT,
      JSON.stringify({ catalog, storedAt: Date.now(), version: STORE_CATALOG_CACHE_VERSION })
    );
  } catch {
    // Non-critical: sessionStorage may be full or unavailable
  }
}

function formatCategoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

export default function StorePage() {
  const { installedAppIds, refreshWorkspace, setAppInstalled } = useWorkspace();
  const toast = useToast();

  const [catalog, setCatalog] = useState<AppCatalogEntry[]>(readCatalogSnapshot);
  const [isCatalogLoading, setIsCatalogLoading] = useState(() => readCatalogSnapshot().length === 0);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [categories, setCategories] = useState<AppCategoryRead[]>([]);

  // Fetch catalog + categories in parallel
  useEffect(() => {
    void Promise.all([getCatalog(), getCategories()])
      .then(([catalogData, categoriesData]) => {
        setCatalog(catalogData);
        setCategories(categoriesData);
        writeCatalogSnapshot(catalogData);
      })
      .finally(() => setIsCatalogLoading(false));
  }, []);

  const mergedCatalog = useMemo(
    () =>
      catalog.map((app) => ({ ...app, is_installed: installedAppIds.has(app.id) })),
    [catalog, installedAppIds]
  );

  const categoryMap = useMemo(() => {
    const map: Record<string, AppCategoryRead> = {};
    for (const cat of categories) {
      map[cat.name.toLowerCase()] = cat;
      map[cat.id.toLowerCase()] = cat;
    }
    return map;
  }, [categories]);

  const getCategory = (categoryId: string): AppCategoryRead => {
    const key = categoryId.toLowerCase();
    return (
      categoryMap[key] ?? {
        id: categoryId,
        name: formatCategoryLabel(categoryId),
        icon: "Package",
        color: "oklch(0.5 0.05 80)",
        order: 999,
      }
    );
  };

  const availableCategories = useMemo(() => {
    const catIds = new Set(mergedCatalog.map((a) => a.category.toLowerCase()));
    const merged = new Set([...categories.map((c) => c.name.toLowerCase()), ...catIds]);
    return ["all", ...Array.from(merged).sort()];
  }, [categories, mergedCatalog]);

  const filtered = useMemo(() => {
    return mergedCatalog.filter((app) => {
      const matchCat = filter === "all" || app.category.toLowerCase() === filter.toLowerCase();
      const matchSearch =
        searchQuery === "" ||
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [mergedCatalog, filter, searchQuery]);

  async function handleToggle(app: AppCatalogEntry) {
    if (installing.has(app.id)) return;
    setInstalling((s) => new Set([...s, app.id]));
    const nextInstalled = !app.is_installed;
    setAppInstalled(app, nextInstalled);

    try {
      if (app.is_installed) {
        await uninstallApp({ app_id: app.id });
        toast.success(`${app.name} uninstalled`, {
          description: "The app has been removed from your workspace",
        });
      } else {
        await installApp({ app_id: app.id });
        toast.success(`${app.name} installed`, {
          description: "The app is now available in your workspace",
          action: {
            label: "Open",
            onClick: () => { window.location.href = ROUTES.APP_DETAIL(app.id); },
          },
        });
      }
      await refreshWorkspace();
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error = err as any;
      const detail = error?.response?.data?.detail || error?.response?.data?.error || error.message || "Please try again later";
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
      setInstalling((s) => {
        const next = new Set(s);
        next.delete(app.id);
        return next;
      });
    }
  }

  if (isCatalogLoading && catalog.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="store-card"
            style={{
              height: "240px",
              animation: `fadeIn 0.4s ease ${i * 0.1}s both`,
            }}
          >
            <div
              className="animate-shimmer"
              style={{ height: "100%", borderRadius: "16px" }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      <StoreFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filter={filter}
        onFilterChange={setFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        availableCategories={availableCategories}
        getCategory={getCategory}
      />

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <DynamicIcon name="Search" size={32} />
          </div>
          <h3 className="empty-state-title">No apps found</h3>
          <p className="empty-state-description">
            Try adjusting your search or category filter.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {filtered.map((app, i) => (
            <AppCard
              key={app.id}
              app={app}
              getCategory={getCategory}
              installing={installing}
              onToggle={handleToggle}
              delay={i * 0.05}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map((app, i) => (
            <AppListItem
              key={app.id}
              app={app}
              getCategory={getCategory}
              installing={installing}
              onToggle={handleToggle}
              delay={i * 0.03}
            />
          ))}
        </div>
      )}
    </div>
  );
}

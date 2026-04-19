import { DynamicIcon } from "@/lib/icon-resolver";
import AppCard from "@/components/store/AppCard";
import AppListItem from "@/components/store/AppListItem";
import StoreFilters from "@/components/store/StoreFilters";
import type { AppCatalogEntry, AppCategoryRead } from "@/types/generated";

import type { StoreViewMode } from "./store-page-state";

export function StorePageLoading() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "1.25rem",
      }}
    >
      {[...Array(6)].map((_, index) => (
        <div
          key={index}
          className="store-card"
          style={{
            height: "240px",
            animation: `fadeIn 0.4s ease ${index * 0.1}s both`,
          }}
        >
          <div className="animate-shimmer" style={{ height: "100%", borderRadius: "16px" }} />
        </div>
      ))}
    </div>
  );
}

export function StorePageFilters(props: {
  availableCategories: string[];
  filter: string;
  getCategory: (categoryId: string) => AppCategoryRead;
  onFilterChange: (category: string) => void;
  onSearchChange: (query: string) => void;
  onViewModeChange: (mode: StoreViewMode) => void;
  searchQuery: string;
  viewMode: StoreViewMode;
}) {
  return <StoreFilters {...props} />;
}

export function StorePageEmpty() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <DynamicIcon name="Search" size={32} />
      </div>
      <h3 className="empty-state-title">No apps found</h3>
      <p className="empty-state-description">Try adjusting your search or category filter.</p>
    </div>
  );
}

export function StorePageResults({
  apps,
  getCategory,
  installing,
  onToggle,
  viewMode,
}: {
  apps: AppCatalogEntry[];
  getCategory: (categoryId: string) => AppCategoryRead;
  installing: Set<string>;
  onToggle: (app: AppCatalogEntry) => void;
  viewMode: StoreViewMode;
}) {
  if (viewMode === "grid") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {apps.map((app, index) => (
          <AppCard
            key={app.id}
            app={app}
            getCategory={getCategory}
            installing={installing}
            onToggle={onToggle}
            delay={index * 0.05}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {apps.map((app, index) => (
        <AppListItem
          key={app.id}
          app={app}
          getCategory={getCategory}
          installing={installing}
          onToggle={onToggle}
          delay={index * 0.03}
        />
      ))}
    </div>
  );
}

/**
 * StoreFilters — search input, view mode toggle, and category filter chips.
 */

import { Grid3X3, List, Search } from "lucide-react";
import type { AppCategoryRead } from "@/types/generated";
import { DynamicIcon } from "@/lib/icon-resolver";

interface StoreFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filter: string;
  onFilterChange: (cat: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  availableCategories: string[];
  getCategory: (id: string) => AppCategoryRead;
}

export default function StoreFilters({
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  availableCategories,
  getCategory,
}: StoreFiltersProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      {/* Search + view toggle */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative", maxWidth: "400px" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "0.875rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-foreground-muted)",
            }}
          />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: "2.5rem",
              background: "var(--color-surface)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button
            className={`btn btn-icon ${viewMode === "grid" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => onViewModeChange("grid")}
            title="Grid view"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            className={`btn btn-icon ${viewMode === "list" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => onViewModeChange("list")}
            title="List view"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Category chips */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {availableCategories.map((catId) => {
          const isSelected = filter.toLowerCase() === catId.toLowerCase();
          const cat = getCategory(catId);

          return (
            <button
              key={catId}
              onClick={() => onFilterChange(catId)}
              className={`badge ${isSelected ? "badge-primary" : "badge-neutral"}`}
              style={{
                cursor: "pointer",
                padding: "0.5rem 0.875rem",
                fontSize: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                transition: "all 0.2s ease",
                transform: isSelected ? "scale(1.02)" : "scale(1)",
              }}
            >
              {catId !== "all" && (
                <DynamicIcon name={cat.icon} size={14} strokeWidth={2} />
              )}
              {catId === "all" ? "All Apps" : cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

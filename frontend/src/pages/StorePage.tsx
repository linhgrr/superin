"use client";

/**
 * StorePage — Refined app store experience.
 *
 * Uses backend catalog as source of truth for all metadata.
 * Categories are fetched from /api/catalog/categories API.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Grid3X3,
  List,
  Search,
  Trash2,
} from "lucide-react";
import { getCategories, installApp, uninstallApp } from "@/api/catalog";
import { useAppCatalog, useToast } from "@/components/providers/AppProviders";
import { DynamicIcon } from "@/lib/icon-resolver";
import type { AppCatalogEntry } from "@/types/generated/api";
import type { Category } from "@/api/catalog";

/**
 * Generate a gradient from an oklch color string.
 */
function generateGradient(color: string | undefined | null): string {
  if (!color) {
    return "linear-gradient(135deg, var(--color-muted) 0%, var(--color-border) 100%)";
  }

  // If it's already a gradient, return as-is
  if (color.includes("gradient")) {
    return color;
  }

  // Parse oklch color and create a gradient
  const oklchMatch = color.match(/oklch\(([\d.]+)\s+([\d.]+)\s+(\d+)\)/);
  if (oklchMatch) {
    const l = parseFloat(oklchMatch[1]);
    const c = parseFloat(oklchMatch[2]);
    const h = parseInt(oklchMatch[3]);

    const l2 = Math.max(0.4, l - 0.07);
    const c2 = c * 1.1;

    return `linear-gradient(135deg, ${color} 0%, oklch(${l2} ${c2} ${h}) 100%)`;
  }

  return `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`;
}

/**
 * Format category name for display.
 */
function formatCategoryLabel(category: string): string {
  // Capitalize first letter
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

export default function StorePage() {
  const { catalog, isCatalogLoading, refreshCatalog, setAppInstalled } = useAppCatalog();
  const toast = useToast();
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Categories from API
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories] = useState(true);

  // Fetch categories on mount
  useEffect(() => {
    async function loadCategories() {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch {
        // Silently fail - categories are for UI enhancement only
      } finally {
        setIsLoadingCategories(false);
      }
    }
    void loadCategories();
  }, []);

  // Build category lookup map
  const categoryMap = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const cat of categories) {
      map[cat.name.toLowerCase()] = cat;
      map[cat.id.toLowerCase()] = cat; // Also map by id
    }
    return map;
  }, [categories]);

  // Get category metadata with fallback
  const getCategory = (categoryId: string): Category => {
    const key = categoryId.toLowerCase();
    return (
      categoryMap[key] || {
        id: categoryId,
        name: formatCategoryLabel(categoryId),
        icon: "Package",
        color: "oklch(0.5 0.05 80)",
        order: 999,
      }
    );
  };

  // Extract unique category IDs from catalog, merged with API categories
  const availableCategories = useMemo(() => {
    const catIds = new Set(catalog.map((a) => a.category.toLowerCase()));
    const merged = new Set([...categories.map((c) => c.name.toLowerCase()), ...catIds]);
    return ["all", ...Array.from(merged).sort()];
  }, [catalog, categories]);

  async function handleToggle(app: AppCatalogEntry) {
    if (installing.has(app.id)) return;
    setInstalling((s) => new Set([...s, app.id]));
    const nextInstalled = !app.is_installed;
    setAppInstalled(app.id, nextInstalled);
    try {
      if (app.is_installed) {
        await uninstallApp({ app_id: app.id });
        toast.success(`${app.name} uninstalled`, { description: "The app has been removed from your workspace" });
      } else {
        await installApp({ app_id: app.id });
        toast.success(`${app.name} installed`, { description: "The app is now available in your workspace", action: { label: "Open", onClick: () => window.location.href = `/apps/${app.id}` } });
      }
    } catch {
      setAppInstalled(app.id, app.is_installed);
      toast.error(`Failed to ${app.is_installed ? "uninstall" : "install"} ${app.name}`, { description: "Please try again later" });
      await refreshCatalog();
    } finally {
      setInstalling((s) => {
        const next = new Set(s);
        next.delete(app.id);
        return next;
      });
    }
  }

  const filtered = catalog.filter((app) => {
    const matchesCategory = filter === "all" || app.category.toLowerCase() === filter.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (isCatalogLoading) {
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
            <div className="animate-shimmer" style={{ height: "100%", borderRadius: "16px" }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Filters bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Search and view toggle */}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <Grid3X3 size={18} />
            </button>
            <button
              className={`btn btn-icon ${viewMode === "list" ? "btn-secondary" : "btn-ghost"}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {/* Category chips */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {availableCategories.map((catId) => {
            const cat = getCategory(catId);
            const isSelected = filter.toLowerCase() === catId.toLowerCase();

            return (
              <button
                key={catId}
                onClick={() => setFilter(catId)}
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
                  <DynamicIcon
                    name={cat.icon}
                    size={14}
                    strokeWidth={2}
                  />
                )}
                {catId === "all" ? "All Apps" : cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Apps grid/list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Search size={32} />
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

// ─── App Card Component ─────────────────────────────────────────────────────

interface AppCardProps {
  app: AppCatalogEntry;
  getCategory: (id: string) => Category;
  installing: Set<string>;
  onToggle: (app: AppCatalogEntry) => void;
  delay?: number;
}

function AppCard({ app, getCategory, installing, onToggle, delay = 0 }: AppCardProps) {
  const gradient = useMemo(() => {
    // Use app's color if available, otherwise derive from category
    return generateGradient(app.color || getCategory(app.category).color);
  }, [app.color, app.category, getCategory]);

  const category = getCategory(app.category);

  return (
    <div
      className="store-card"
      style={{
        animation: `fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s both`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "0.25rem" }}>
        <div
          className="store-card-icon"
          style={{ background: gradient }}
        >
          {app.icon ? (
            <DynamicIcon name={app.icon} size={24} strokeWidth={2} />
          ) : (
            <span>{app.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="store-card-title">{app.name}</h3>
          <div className="store-card-meta">
            <span
              className="badge badge-neutral"
              style={{ fontSize: "0.625rem", padding: "0.125rem 0.5rem" }}
            >
              {category.name}
            </span>
            <span>v{app.version}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="store-card-description">{app.description}</p>

      {/* Install button */}
      <button
        className={`btn ${app.is_installed ? "btn-ghost" : "btn-primary"}`}
        onClick={() => onToggle(app)}
        disabled={installing.has(app.id)}
        style={{
          width: "100%",
          justifyContent: "center",
          opacity: installing.has(app.id) ? 0.6 : 1,
        }}
      >
        {installing.has(app.id) ? (
          <span className="animate-spin" style={{ marginRight: "0.5rem" }}>
            ⏳
          </span>
        ) : app.is_installed ? (
          <>
            <Trash2 size={16} style={{ marginRight: "0.5rem" }} />
            Uninstall
          </>
        ) : (
          <>
            <Download size={16} style={{ marginRight: "0.5rem" }} />
            Install
          </>
        )}
      </button>
    </div>
  );
}

// ─── App List Item Component ────────────────────────────────────────────────

function AppListItem({ app, getCategory, installing, onToggle, delay = 0 }: AppCardProps) {
  const gradient = useMemo(() => {
    return generateGradient(app.color || getCategory(app.category).color);
  }, [app.color, app.category, getCategory]);

  const category = getCategory(app.category);

  return (
    <div
      className="store-card"
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: "1rem 1.25rem",
        animation: `fadeIn 0.3s ease ${delay}s both`,
      }}
    >
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "10px",
          background: gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1rem",
          fontWeight: 700,
          color: "white",
          flexShrink: 0,
          fontFamily: "var(--font-display)",
          boxShadow: "0 2px 8px oklch(0 0 0 / 0.2)",
        }}
      >
        {app.icon ? (
          <DynamicIcon name={app.icon} size={20} strokeWidth={2} />
        ) : (
          <span>{app.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, marginLeft: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              fontSize: "0.9375rem",
              color: "var(--color-foreground)",
              margin: 0,
            }}
          >
            {app.name}
          </h3>
          <span
            className="badge badge-neutral"
            style={{ fontSize: "0.625rem", padding: "0.125rem 0.5rem" }}
          >
            {category.name}
          </span>
        </div>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-foreground-muted)",
            margin: "0.25rem 0 0 0",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {app.description}
        </p>
      </div>

      <button
        className={`btn ${app.is_installed ? "btn-ghost" : "btn-primary"} btn-sm`}
        onClick={() => onToggle(app)}
        disabled={installing.has(app.id)}
        style={{
          marginLeft: "1rem",
          opacity: installing.has(app.id) ? 0.6 : 1,
          minWidth: "100px",
        }}
      >
        {installing.has(app.id) ? (
          <span className="animate-spin">⏳</span>
        ) : app.is_installed ? (
          <>
            <Trash2 size={14} style={{ marginRight: "0.375rem" }} />
            Uninstall
          </>
        ) : (
          <>
            <Download size={14} style={{ marginRight: "0.375rem" }} />
            Install
          </>
        )}
      </button>
    </div>
  );
}

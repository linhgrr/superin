/**
 * StorePage — Refined app store experience.
 */

import { useState, useEffect } from "react";
import {
  DollarSign,
  Zap,
  Heart,
  Users,
  Wrench,
  Package,
  Download,
  Trash2,
  Search,
  Grid3X3,
  List,
} from "lucide-react";
import { installApp, uninstallApp } from "@/api/catalog";
import { useAppCatalog } from "@/components/providers/AppProviders";
import type { AppCatalogEntry } from "@/types/generated/api";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  finance: <DollarSign size={14} />,
  productivity: <Zap size={14} />,
  health: <Heart size={14} />,
  social: <Users size={14} />,
  developer: <Wrench size={14} />,
  other: <Package size={14} />,
};

const CATEGORY_LABELS: Record<string, string> = {
  finance: "Finance",
  productivity: "Productivity",
  health: "Health",
  social: "Social",
  developer: "Developer",
  other: "Other",
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  finance: "linear-gradient(135deg, oklch(0.72 0.19 145) 0%, oklch(0.65 0.22 145) 100%)",
  productivity: "linear-gradient(135deg, oklch(0.65 0.2 85) 0%, oklch(0.7 0.22 85) 100%)",
  health: "linear-gradient(135deg, oklch(0.65 0.22 25) 0%, oklch(0.6 0.24 25) 100%)",
  social: "linear-gradient(135deg, oklch(0.6 0.18 280) 0%, oklch(0.65 0.2 280) 100%)",
  developer: "linear-gradient(135deg, oklch(0.55 0.15 250) 0%, oklch(0.6 0.17 250) 100%)",
  other: "linear-gradient(135deg, oklch(0.5 0.05 80) 0%, oklch(0.55 0.08 80) 100%)",
};

export default function StorePage() {
  const { catalog, isCatalogLoading, refreshCatalog, setAppInstalled } = useAppCatalog();
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  async function handleToggle(app: AppCatalogEntry) {
    if (installing.has(app.id)) return;
    setInstalling((s) => new Set([...s, app.id]));
    const nextInstalled = !app.is_installed;
    setAppInstalled(app.id, nextInstalled);
    try {
      if (app.is_installed) {
        await uninstallApp({ app_id: app.id });
      } else {
        await installApp({ app_id: app.id });
      }
    } catch {
      setAppInstalled(app.id, app.is_installed);
      await refreshCatalog();
    } finally {
      setInstalling((s) => {
        const next = new Set(s);
        next.delete(app.id);
        return next;
      });
    }
  }

  const categories = ["all", ...new Set(catalog.map((a) => a.category))];

  const filtered = catalog.filter((app) => {
    const matchesCategory = filter === "all" || app.category === filter;
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
              height: "200px",
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
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`badge ${filter === cat ? "badge-primary" : "badge-neutral"}`}
              style={{
                cursor: "pointer",
                padding: "0.5rem 0.875rem",
                fontSize: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                transition: "all 0.2s ease",
                transform: filter === cat ? "scale(1.02)" : "scale(1)",
              }}
            >
              {cat !== "all" && CATEGORY_ICONS[cat]}
              {cat === "all" ? "All Apps" : CATEGORY_LABELS[cat]}
            </button>
          ))}
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
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {filtered.map((app, i) => (
            <AppCard
              key={app.id}
              app={app}
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
  installing: Set<string>;
  onToggle: (app: AppCatalogEntry) => void;
  delay?: number;
}

function AppCard({ app, installing, onToggle, delay = 0 }: AppCardProps) {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const gradient =
    app.color || CATEGORY_GRADIENTS[app.category] || CATEGORY_GRADIENTS.other;

  return (
    <div
      className="store-card"
      onMouseMove={handleMouseMove}
      style={{
        "--mouse-x": `${mousePos.x}%`,
        "--mouse-y": `${mousePos.y}%`,
        animation: `fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s both`,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
        <div
          className="store-card-icon"
          style={{ background: gradient }}
        >
          {app.icon
            ? app.icon.slice(0, 2).toUpperCase()
            : app.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="store-card-title">{app.name}</h3>
          <div className="store-card-meta">
            <span
              className="badge badge-neutral"
              style={{ fontSize: "0.625rem", padding: "0.125rem 0.5rem" }}
            >
              {CATEGORY_LABELS[app.category] ?? app.category}
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

function AppListItem({ app, installing, onToggle, delay = 0 }: AppCardProps) {
  const gradient =
    app.color || CATEGORY_GRADIENTS[app.category] || CATEGORY_GRADIENTS.other;

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
        {app.icon
          ? app.icon.slice(0, 2).toUpperCase()
          : app.name.slice(0, 2).toUpperCase()}
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
            {CATEGORY_LABELS[app.category] ?? app.category}
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

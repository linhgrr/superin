/**
 * StorePage — /store — browse and install apps.
 */

import { useEffect, useState } from "react";
import { getCatalog, installApp, uninstallApp } from "@/api/catalog";
import type { AppCatalogEntry } from "@/types/generated/api";
import AppShell from "./AppShell";

const CATEGORY_LABELS: Record<string, string> = {
  finance: "💰 Finance",
  productivity: "⚡ Productivity",
  health: "❤️ Health",
  social: "👥 Social",
  developer: "🛠 Developer",
  other: "📦 Other",
};

export default function StorePage() {
  const [catalog, setCatalog] = useState<AppCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");

  function load() {
    getCatalog()
      .then(setCatalog)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggle(app: AppCatalogEntry) {
    if (installing.has(app.id)) return;
    setInstalling((s) => new Set([...s, app.id]));
    try {
      if (app.is_installed) {
        await uninstallApp({ app_id: app.id });
      } else {
        await installApp({ app_id: app.id });
      }
      load();
    } catch {
      // Silent fail — keep UI as-is
    } finally {
      setInstalling((s) => {
        const next = new Set(s);
        next.delete(app.id);
        return next;
      });
    }
  }

  const categories = ["all", ...new Set(catalog.map((a) => a.category))];
  const filtered =
    filter === "all" ? catalog : catalog.filter((a) => a.category === filter);

  return (
    <AppShell title="App Store">
      {/* Category filter */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            className="btn btn-ghost"
            onClick={() => setFilter(cat)}
            style={{
              background:
                filter === cat
                  ? "var(--color-primary)"
                  : "var(--color-surface-elevated)",
              color:
                filter === cat
                  ? "var(--color-primary-foreground)"
                  : "var(--color-muted)",
              borderRadius: "999px",
              padding: "0.25rem 0.75rem",
              fontSize: "0.8125rem",
            }}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* App grid */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "1rem",
          }}
        >
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              style={{
                height: "160px",
                background: "var(--color-surface-elevated)",
                borderRadius: "0.75rem",
                border: "1px solid var(--color-border)",
              }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--color-muted)", textAlign: "center", padding: "3rem 0" }}>
          No apps in this category.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "1rem",
          }}
        >
          {filtered.map((app) => (
            <div
              key={app.id}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.75rem",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {/* Icon + name */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: app.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "white",
                    flexShrink: 0,
                  }}
                >
                  {app.icon ? app.icon.slice(0, 2).toUpperCase() : app.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    {app.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--color-muted)",
                    }}
                  >
                    v{app.version} · {CATEGORY_LABELS[app.category] ?? app.category}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-muted)",
                  margin: 0,
                  lineHeight: 1.4,
                  flex: 1,
                }}
              >
                {app.description}
              </p>

              {/* Install button */}
              <button
                className={`btn ${app.is_installed ? "btn-ghost" : "btn-primary"}`}
                onClick={() => handleToggle(app)}
                disabled={installing.has(app.id)}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  opacity: installing.has(app.id) ? 0.7 : 1,
                }}
              >
                {installing.has(app.id)
                  ? "…"
                  : app.is_installed
                  ? "Uninstall"
                  : "Install"}
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

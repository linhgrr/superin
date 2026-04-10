/**
 * AppCard — grid view card for a catalog app.
 */

import { useMemo } from "react";
import { Download, Trash2 } from "lucide-react";
import type { AppCatalogEntry, AppCategoryRead } from "@/types/generated";
import { DynamicIcon } from "@/lib/icon-resolver";
import { generateGradient } from "./generateGradient";

interface AppCardProps {
  app: AppCatalogEntry;
  getCategory: (id: string) => AppCategoryRead;
  installing: Set<string>;
  onToggle: (app: AppCatalogEntry) => void;
  delay?: number;
}

export default function AppCard({
  app,
  getCategory,
  installing,
  onToggle,
  delay = 0,
}: AppCardProps) {
  const gradient = useMemo(
    () => generateGradient(app.color || getCategory(app.category).color),
    [app.color, app.category, getCategory]
  );

  const category = getCategory(app.category);

  return (
    <div
      className="store-card"
      style={{
        animation: `fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s both`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "0.25rem",
        }}
      >
        <div className="store-card-icon" style={{ background: gradient }}>
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

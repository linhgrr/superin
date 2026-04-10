/**
 * AppListItem — list view row for a catalog app.
 */

import { useMemo } from "react";
import type { AppCatalogEntry, AppCategoryRead } from "@/types/generated";
import { DynamicIcon } from "@/lib/icon-resolver";
import { generateGradient } from "./generateGradient";

interface AppListItemProps {
  app: AppCatalogEntry;
  getCategory: (id: string) => AppCategoryRead;
  installing: Set<string>;
  onToggle: (app: AppCatalogEntry) => void;
  delay?: number;
}

export default function AppListItem({
  app,
  getCategory,
  installing,
  onToggle,
  delay = 0,
}: AppListItemProps) {
  const gradient = useMemo(
    () => generateGradient(app.color || getCategory(app.category).color),
    [app.color, app.category, getCategory]
  );

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
      {/* Icon */}
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

      {/* Info */}
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
          <span className="badge badge-neutral" style={{ fontSize: "0.625rem", padding: "0.125rem 0.5rem" }}>
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

      {/* Action */}
      <button
        className={`btn ${app.is_installed ? "btn-ghost" : "btn-primary"} btn-sm`}
        onClick={() => onToggle(app)}
        disabled={installing.has(app.id)}
        style={{ marginLeft: "1rem", opacity: installing.has(app.id) ? 0.6 : 1, minWidth: "100px" }}
      >
        {installing.has(app.id) ? (
          <span className="animate-spin">⏳</span>
        ) : app.is_installed ? (
          <>
            <DynamicIcon name="Trash2" size={14} style={{ marginRight: "0.375rem" }} />
            Uninstall
          </>
        ) : (
          <>
            <DynamicIcon name="Download" size={14} style={{ marginRight: "0.375rem" }} />
            Install
          </>
        )}
      </button>
    </div>
  );
}

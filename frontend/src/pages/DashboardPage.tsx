/**
 * DashboardPage — main landing after login.
 *
 * Architecture:
 *   DashboardPage
 *   ├── DashboardEditProvider
 *   │   └── DashboardInner
 *   │       ├── DndContext (edit mode only)
 *   │       │   └── SortableContext
 *   │       │       └── SortableWidgetCard[] (edit) | WidgetCard[] (view)
 *   │       ├── EditModeBar (edit mode only)
 *   │       ├── AddWidgetDialog (overlay)
 *   │       └── "✎ Edit Dashboard" button (view mode only)
 */

import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";

import AddWidgetDialog from "@/components/dashboard/AddWidgetDialog";
import EditModeBar from "@/components/dashboard/EditModeBar";
import SortableWidgetCard from "@/components/dashboard/SortableWidgetCard";
import { DashboardEditProvider, useDashboardEdit } from "@/hooks/useDashboardEdit";
import { getCatalog, getAllPreferences } from "@/api/catalog";
import type { AppCatalogEntry, WidgetPreferenceSchema } from "@/types/generated/api";
import AppShell from "./AppShell";
import FinanceWidget from "./widgets/FinanceWidget";
import TodoWidget from "./widgets/TodoWidget";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Flattened widget record used internally to track position & visibility. */
interface ResolvedWidget {
  widgetId: string; // full id e.g. "finance.total-balance"
  appId: string;
  app: AppCatalogEntry;
  widget: AppCatalogEntry["widgets"][number];
  position: number;
}

// ─── WidgetContent ─────────────────────────────────────────────────────────────

/** Renders the actual widget component based on appId. */
function WidgetContent({
  appId,
  widgetId,
  widget,
}: {
  appId: string;
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
}) {
  if (appId === "finance") {
    return <FinanceWidget widgetId={widgetId} widget={widget} />;
  }
  if (appId === "todo") {
    return <TodoWidget widgetId={widgetId} widget={widget} />;
  }
  // Fallback for unknown apps
  return (
    <div>
      <p className="section-label">{widget.name}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
        {widget.description}
      </p>
    </div>
  );
}

// ─── WidgetCard ───────────────────────────────────────────────────────────────

/**
 * Non-sortable card used in VIEW mode.
 * Shows widget content only (no drag handle / remove button).
 */
function WidgetCard({
  appId,
  widgetId,
  widget,
}: {
  appId: string;
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
}) {
  return (
    <div className={`widget-${widget.size}`}>
      <WidgetContent appId={appId} widgetId={widgetId} widget={widget} />
    </div>
  );
}

// ─── Inner component (uses hooks) ─────────────────────────────────────────────

/**
 * All interactive hooks (`useDashboardEdit`) live here so they are guaranteed
 * to be called inside <DashboardEditProvider>.
 */
function DashboardInner({
  installedApps,
}: {
  installedApps: AppCatalogEntry[];
}) {
  const {
    isEditMode,
    pendingChanges,
    enterEditMode,
    toggleWidget,
    moveWidget,
  } = useDashboardEdit();

  const [prefs, setPrefs] = useState<Map<string, WidgetPreferenceSchema>>(new Map());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const installedAppIds = useMemo(
    () => new Set(installedApps.map((a) => a.id)),
    [installedApps]
  );

  // ── Load preferences ────────────────────────────────────────────────────────

  const reloadPrefs = useCallback(async () => {
    const prefs = await getAllPreferences();
    const next = new Map<string, WidgetPreferenceSchema>();
    prefs.forEach((p) => next.set(p.widget_id, p));
    setPrefs(next);
  }, []);

  useEffect(() => {
    reloadPrefs();
  }, [reloadPrefs]);

  /**
   * Returns widgets that should currently be visible:
   * - enabled in prefs (or pendingChanges enables them), sorted by position.
   */
  const visibleWidgets = useMemo<ResolvedWidget[]>(() => {
    const items: ResolvedWidget[] = [];

    for (const app of installedApps) {
      for (const widget of app.widgets) {
        const prefsEntry = prefs.get(widget.id);
        const change = pendingChanges.get(widget.id);

        // Determine if enabled
        const wasEnabled = prefsEntry?.enabled ?? !widget.requires_auth;
        const isEnabled = change?.enabled !== undefined ? change.enabled : wasEnabled;

        if (!isEnabled) continue;

        // Determine position from pendingChanges, prefs, or default
        const position =
          change?.position !== undefined
            ? change.position
            : prefsEntry?.position ?? 0;

        items.push({ widgetId: widget.id, appId: app.id, app, widget, position });
      }
    }

    return items.sort((a, b) => a.position - b.position);
  }, [installedApps, prefs, pendingChanges]);

  const widgetIds = useMemo(() => visibleWidgets.map((w) => w.widgetId), [visibleWidgets]);

  // ── Edit mode actions ──────────────────────────────────────────────────────

  const handleRemove = useCallback(
    (widgetId: string) => {
      toggleWidget(widgetId, false);
    },
    [toggleWidget]
  );

  const handleAddWidget = useCallback(
    (widgetId: string) => {
      // Place at the end of the current list
      const maxPos = visibleWidgets.reduce((m, w) => Math.max(m, w.position), -1);
      moveWidget(widgetId, maxPos + 1);
      toggleWidget(widgetId, true);
    },
    [moveWidget, toggleWidget, visibleWidgets]
  );

  const handleSaveSuccess = useCallback(() => {
    reloadPrefs();
  }, [reloadPrefs]);

  // ── Drag-drop handlers ─────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setIsDragging(false);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = widgetIds.indexOf(String(active.id));
      const newIndex = widgetIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      // Reorder all widgets by position after the move
      const reordered = arrayMove(visibleWidgets, oldIndex, newIndex);
      reordered.forEach((w, idx) => {
        if (w.position !== idx) moveWidget(w.widgetId, idx);
      });
    },
    [widgetIds, visibleWidgets, moveWidget]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Edit mode toolbar */}
      <EditModeBar
        installedAppIds={installedAppIds}
        isEditMode={isEditMode}
        onAddWidget={() => setAddDialogOpen(true)}
        onSaveSuccess={handleSaveSuccess}
      />

      {/* Widget grid */}
      <div className="widget-grid" data-edit-mode={isEditMode} data-dragging={isDragging}>
        {isEditMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgetIds}>
              {visibleWidgets.map(({ widgetId, appId, widget }) => (
                <SortableWidgetCard
                  key={widgetId}
                  widgetId={widgetId}
                  onRemove={handleRemove}
                >
                  <WidgetContent appId={appId} widgetId={widgetId} widget={widget} />
                </SortableWidgetCard>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visibleWidgets.map(({ widgetId, appId, widget }) => (
            <WidgetCard
              key={widgetId}
              appId={appId}
              widgetId={widgetId}
              widget={widget}
            />
          ))
        )}
      </div>

      {/* "✎ Edit Dashboard" button — view mode only */}
      {!isEditMode && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0.5rem 0" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={enterEditMode}
            aria-label="Edit dashboard"
          >
            ✎ Edit Dashboard
          </button>
        </div>
      )}

      {/* Add widget dialog — rendered as overlay regardless of edit mode */}
      {addDialogOpen && (
        <AddWidgetDialog
          catalog={installedApps}
          onAdd={(widgetId) => {
            handleAddWidget(widgetId);
            setAddDialogOpen(false);
          }}
          onClose={() => setAddDialogOpen(false)}
        />
      )}
    </>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [catalog, setCatalog] = useState<AppCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCatalog()
      .then((c) => setCatalog(c.filter((app) => app.is_installed)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell title="Dashboard">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: "1rem",
          }}
        >
          {["small", "medium", "large", "small", "medium", "large"].map((size, i) => (
            <div key={i} className={`widget-${size}`}>
              <div
                className="widget-card"
                style={{
                  height: "120px",
                  background: "var(--color-surface-elevated)",
                  animation: "pulse 1.5s infinite",
                }}
              />
            </div>
          ))}
        </div>
      </AppShell>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  const allWidgets = catalog.flatMap((app) => app.widgets ?? []);

  if (allWidgets.length === 0) {
    return (
      <AppShell title="Dashboard">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
            gap: "0.75rem",
            color: "var(--color-muted)",
          }}
        >
          <span style={{ fontSize: "2rem" }}>🛍</span>
          <p style={{ fontSize: "1rem", fontWeight: 500, color: "var(--color-foreground)" }}>
            No apps installed yet
          </p>
          <p style={{ fontSize: "0.875rem" }}>
            Visit the{" "}
            <a href="/store" style={{ color: "var(--color-primary)" }}>
              App Store
            </a>{" "}
            to get started.
          </p>
        </div>
      </AppShell>
    );
  }

  // ── Normal render ───────────────────────────────────────────────────────────

  return (
    <DashboardEditProvider>
      <AppShell title="Dashboard">
        <DashboardInner installedApps={catalog} />
      </AppShell>
    </DashboardEditProvider>
  );
}

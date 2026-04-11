/**
 * Layout engine — pure functions for computing widget grid layout.
 * No side effects, no React hooks, no state.
 */

import type { Layout, LayoutItem } from "react-grid-layout";
import { WIDGET_SIZES } from "@/lib/widget-sizes";
import type {
  ResolvedWidget,
  WidgetManifestSchema,
  WidgetPreferenceSchema,
} from "@/types/generated";

// ─── Size config ─────────────────────────────────────────────────────────────

export function getSizeConfig(
  size: string
): (typeof WIDGET_SIZES)[keyof typeof WIDGET_SIZES] {
  return WIDGET_SIZES[size as keyof typeof WIDGET_SIZES] ?? WIDGET_SIZES.standard;
}

// appIdFrom lives in preference-utils.ts

// ─── Preference equality ──────────────────────────────────────────────────────

export function arePreferencesEqual(
  left: WidgetPreferenceSchema | undefined,
  right: WidgetPreferenceSchema | undefined
): boolean {
  if (!left || !right) return left === right;
  return (
    left._id === right._id &&
    left.user_id === right.user_id &&
    left.widget_id === right.widget_id &&
    left.app_id === right.app_id &&
    left.enabled === right.enabled &&
    left.sort_order === right.sort_order &&
    left.grid_x === right.grid_x &&
    left.grid_y === right.grid_y &&
    left.size_w === right.size_w &&
    left.size_h === right.size_h
  );
}

export function arePreferenceMapsEqual(
  left: Map<string, WidgetPreferenceSchema>,
  right: Map<string, WidgetPreferenceSchema>
): boolean {
  if (left.size !== right.size) return false;
  for (const [widgetId, leftPreference] of left) {
    if (!arePreferencesEqual(leftPreference, right.get(widgetId))) {
      return false;
    }
  }
  return true;
}

// ─── Saved position helpers ───────────────────────────────────────────────────

function getSavedGridPosition(
  pref: WidgetPreferenceSchema | undefined
): { x: number; y: number } | null {
  const savedX = pref?.grid_x;
  const savedY = pref?.grid_y;
  if (typeof savedX === "number" && typeof savedY === "number") {
    return { x: savedX, y: savedY };
  }
  return null;
}

export function getWidgetDimensions(
  widget: WidgetManifestSchema,
  pref: WidgetPreferenceSchema | undefined,
  cols: number
): { width: number; height: number } {
  const config = getSizeConfig(widget.size);
  const width = Math.min(Math.max(pref?.size_w ?? config.width, 1), cols);
  const height = Math.max(pref?.size_h ?? config.rglH, 1);
  return { width, height };
}

// ─── Auto-rearrange ──────────────────────────────────────────────────────────

/**
 * Pack widgets into rows sorted by width (largest first).
 * Uses a simple row-by-row bin-packing algorithm.
 */
export function autoRearrangeWidgets(
  widgets: ResolvedWidget[],
  prefs: Map<string, WidgetPreferenceSchema>,
  cols = 12
): Layout {
  const sorted = [...widgets].sort((a, b) => {
    const aConfig = getSizeConfig(a.widget.size);
    const bConfig = getSizeConfig(b.widget.size);
    const aWidth = prefs.get(a.widgetId)?.size_w ?? aConfig.width;
    const bWidth = prefs.get(b.widgetId)?.size_w ?? bConfig.width;
    return bWidth - aWidth;
  });

  const layout: LayoutItem[] = [];
  let currentRow = 0;
  let currentCol = 0;
  let rowHeight = 0;

  for (const rw of sorted) {
    const pref = prefs.get(rw.widgetId);
    const config = getSizeConfig(rw.widget.size);
    const w = pref?.size_w ?? config.width;
    const h = pref?.size_h ?? config.rglH;

    if (currentCol + w > cols) {
      currentRow += rowHeight;
      currentCol = 0;
      rowHeight = 0;
    }

    layout.push({ i: rw.widgetId, x: currentCol, y: currentRow, w, h });
    currentCol += w;
    rowHeight = Math.max(rowHeight, h);
  }

  return layout;
}

// ─── Packed layout ───────────────────────────────────────────────────────────

/**
 * Smart packer: preserves saved positions where possible,
 * fills gaps with unsaved widgets using a best-fit column algorithm.
 */
export function computePackedLayout(
  widgets: ResolvedWidget[],
  prefs: Map<string, WidgetPreferenceSchema>,
  cols: number
): Layout {
  const bySavedPosition: ResolvedWidget[] = [];
  const unsaved: ResolvedWidget[] = [];

  for (const widget of widgets) {
    const pref = prefs.get(widget.widgetId);
    if (getSavedGridPosition(pref)) {
      bySavedPosition.push(widget);
    } else {
      unsaved.push(widget);
    }
  }

  bySavedPosition.sort((left, right) => {
    const leftPos = getSavedGridPosition(prefs.get(left.widgetId));
    const rightPos = getSavedGridPosition(prefs.get(right.widgetId));
    const leftY = leftPos?.y ?? 0;
    const rightY = rightPos?.y ?? 0;
    if (leftY !== rightY) return leftY - rightY;
    const leftX = leftPos?.x ?? 0;
    const rightX = rightPos?.x ?? 0;
    if (leftX !== rightX) return leftX - rightX;
    return left.widgetId.localeCompare(right.widgetId);
  });

  unsaved.sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.widgetId.localeCompare(right.widgetId);
  });

  const layout: Layout = [];
  const columnBottoms = Array.from({ length: cols }, () => 0);

  const placeAt = (widget: ResolvedWidget, x: number, y: number) => {
    const pref = prefs.get(widget.widgetId);
    const { width, height } = getWidgetDimensions(widget.widget, pref, cols);
    const clampedX = Math.max(0, Math.min(x, cols - width));
    const requestedY = Math.max(0, y);
    const floorY = Math.max(...columnBottoms.slice(clampedX, clampedX + width));
    const nextY = Math.max(requestedY, floorY);

    layout.push({ i: widget.widgetId, x: clampedX, y: nextY, w: width, h: height });

    for (let col = clampedX; col < clampedX + width; col += 1) {
      columnBottoms[col] = Math.max(columnBottoms[col], nextY + height);
    }
  };

  for (const widget of bySavedPosition) {
    const saved = getSavedGridPosition(prefs.get(widget.widgetId));
    placeAt(widget, saved?.x ?? 0, saved?.y ?? 0);
  }

  for (const widget of unsaved) {
    const pref = prefs.get(widget.widgetId);
    const { width } = getWidgetDimensions(widget.widget, pref, cols);

    let bestX = 0;
    let bestY = Number.POSITIVE_INFINITY;

    for (let x = 0; x <= cols - width; x += 1) {
      const y = Math.max(...columnBottoms.slice(x, x + width));
      if (y < bestY || (y === bestY && x < bestX)) {
        bestY = y;
        bestX = x;
      }
    }

    placeAt(widget, bestX, Number.isFinite(bestY) ? bestY : 0);
  }

  return layout.sort((left, right) => {
    if (left.y !== right.y) return left.y - right.y;
    if (left.x !== right.x) return left.x - right.x;
    return left.i.localeCompare(right.i);
  });
}

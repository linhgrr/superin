/**
 * Shared preference merge utilities — used by both WorkspaceProvider
 * and useWidgetPreferences. Keeps the merge semantics in one place.
 */

import type { PreferenceUpdate, WidgetPreferenceSchema } from "@/types/generated";

/**
 * Extract the app-id prefix from a widget ID (e.g. "finance.total_balance" → "finance").
 */
export function appIdFrom(widgetId: string): string {
  const dot = widgetId.indexOf(".");
  return dot === -1 ? widgetId : widgetId.slice(0, dot);
}

/**
 * Apply a list of PreferenceUpdate to an existing preference list,
 * returning a new merged array. Existing entries are preserved where
 * updates don't specify a field.
 */
export function mergePreferenceUpdates(
  current: WidgetPreferenceSchema[],
  updates: PreferenceUpdate[]
): WidgetPreferenceSchema[] {
  const next = new Map(current.map((pref) => [pref.widget_id, pref] as const));

  for (const update of updates) {
    const existing = next.get(update.widget_id);
    const appId = existing?.app_id ?? appIdFrom(update.widget_id);

    next.set(update.widget_id, {
      _id: existing?._id ?? null,
      user_id: existing?.user_id ?? "",
      widget_id: update.widget_id,
      app_id: appId,
      enabled: update.enabled ?? existing?.enabled ?? false,
      sort_order: update.sort_order ?? existing?.sort_order ?? 0,
      grid_x: update.grid_x ?? existing?.grid_x ?? 0,
      grid_y: update.grid_y ?? existing?.grid_y ?? 0,
      size_w: update.size_w ?? existing?.size_w ?? null,
      size_h: update.size_h ?? existing?.size_h ?? null,
    });
  }

  return Array.from(next.values());
}

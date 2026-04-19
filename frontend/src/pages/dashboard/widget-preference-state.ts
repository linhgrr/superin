import type { Layout } from "react-grid-layout";

import { updatePreferences } from "@/api/catalog";
import type {
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetManifestSchema,
  WidgetPreferenceSchema,
} from "@/types/generated";

import { getSizeConfig } from "./layout-engine";
import { appIdFrom, mergePreferenceUpdates } from "./preference-utils";

export interface ResolvedWidget {
  widgetId: string;
  appId: string;
  app: AppRuntimeEntry;
  widget: WidgetManifestSchema;
  sort_order: number;
}

export function buildPreferenceMap(preferences: WidgetPreferenceSchema[]) {
  return new Map(preferences.map((preference) => [preference.widget_id, preference] as const));
}

export function applyUpdatesToPreferenceMap(
  current: Map<string, WidgetPreferenceSchema>,
  updates: PreferenceUpdate[],
) {
  return new Map(
    mergePreferenceUpdates(Array.from(current.values()), updates).map((preference) => [
      preference.widget_id,
      preference,
    ] as const),
  );
}

export function resolveVisibleWidgets({
  installedApps,
  isWidgetEnabled,
  prefs,
}: {
  installedApps: AppRuntimeEntry[];
  isWidgetEnabled: (widget: WidgetManifestSchema, pref: WidgetPreferenceSchema | undefined) => boolean;
  prefs: Map<string, WidgetPreferenceSchema>;
}) {
  const items: ResolvedWidget[] = [];

  for (const app of installedApps) {
    for (const widget of app.widgets ?? []) {
      const prefsEntry = prefs.get(widget.id);
      if (!isWidgetEnabled(widget, prefsEntry)) continue;
      const sort_order = prefsEntry?.sort_order ?? 0;
      items.push({ widgetId: widget.id, appId: app.id, app, widget, sort_order });
    }
  }

  return items.sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.widgetId.localeCompare(right.widgetId);
  });
}

export function buildLayoutUpdates({
  currentLayout,
  prefs,
  visibleWidgetMap,
}: {
  currentLayout: Layout[];
  prefs: Map<string, WidgetPreferenceSchema>;
  visibleWidgetMap: Map<string, ResolvedWidget>;
}) {
  const updates: PreferenceUpdate[] = [];

  for (const item of currentLayout) {
    const existing = prefs.get(item.i);
    const resolved = visibleWidgetMap.get(item.i);
    if (!resolved) continue;

    const defaultConfig = getSizeConfig(resolved.widget.size);
    const nextSizeW = item.w !== defaultConfig.width ? item.w : null;
    const nextSizeH = item.h !== defaultConfig.rglH ? item.h : null;

    if (
      existing?.grid_x === item.x &&
      existing?.grid_y === item.y &&
      (existing?.size_w ?? null) === nextSizeW &&
      (existing?.size_h ?? null) === nextSizeH
    ) {
      continue;
    }

    updates.push({
      widget_id: item.i,
      grid_x: item.x,
      grid_y: item.y,
      size_w: nextSizeW,
      size_h: nextSizeH,
    });
  }

  return updates;
}

export async function persistPreferenceUpdates({
  installedAppIds,
  updates,
}: {
  installedAppIds: Set<string>;
  updates: PreferenceUpdate[];
}) {
  const byApp = new Map<string, PreferenceUpdate[]>();

  for (const update of updates) {
    const appId = appIdFrom(update.widget_id);
    if (!installedAppIds.has(appId)) continue;
    const appUpdates = byApp.get(appId) ?? [];
    appUpdates.push(update);
    byApp.set(appId, appUpdates);
  }

  await Promise.all(
    [...byApp].map(([appId, appUpdates]) => updatePreferences(appId, appUpdates)),
  );
}

export function getNextWidgetPlacement(currentLayout: Layout[]) {
  if (currentLayout.length === 0) return { x: 0, y: 0 };

  return {
    x: 0,
    y: currentLayout.reduce((maxY, item) => Math.max(maxY, item.y + item.h), 0),
  };
}

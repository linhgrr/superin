import { clearActiveApps } from "@/lib/lazy-registry";
import { mergePreferenceUpdates } from "@/pages/dashboard/preference-utils";
import type {
  AppCatalogEntry,
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetPreferenceSchema,
  WorkspaceBootstrap,
} from "@/types/generated";

export interface WorkspaceEntities {
  installedAppOrder: string[];
  installedAppsById: Record<string, AppRuntimeEntry>;
  widgetPreferencesById: Record<string, WidgetPreferenceSchema>;
}

export interface WorkspaceStateData {
  initialWidgetDataById: Record<string, unknown>;
  installedAppIds: Set<string>;
  installedAppOrder: string[];
  installedAppsById: Record<string, AppRuntimeEntry>;
  isWorkspaceLoading: boolean;
  isWorkspaceRefreshing: boolean;
  refreshRequestId: number;
  sessionRevision: number;
  userId: string | null;
  widgetPreferencesById: Record<string, WidgetPreferenceSchema>;
  workspaceError: string | null;
}

export function toRuntimeApp(app: AppCatalogEntry): AppRuntimeEntry {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    icon: app.icon,
    color: app.color,
    category: app.category,
    version: app.version,
    author: app.author,
    widgets: app.widgets ?? [],
  };
}

export function toInstalledAppIds(installedApps: AppRuntimeEntry[]): Set<string> {
  return new Set(installedApps.map((app) => app.id));
}

export function indexInstalledApps(
  installedApps: AppRuntimeEntry[],
): Record<string, AppRuntimeEntry> {
  const installedAppsById: Record<string, AppRuntimeEntry> = {};

  for (const app of installedApps) {
    installedAppsById[app.id] = app;
  }

  return installedAppsById;
}

export function indexWidgetPreferences(
  widgetPreferences: WidgetPreferenceSchema[],
): Record<string, WidgetPreferenceSchema> {
  const widgetPreferencesById: Record<string, WidgetPreferenceSchema> = {};

  for (const preference of widgetPreferences) {
    widgetPreferencesById[preference.widget_id] = preference;
  }

  return widgetPreferencesById;
}

export function normalizeWorkspaceEntities(
  installedApps: AppRuntimeEntry[],
  widgetPreferences: WidgetPreferenceSchema[],
): WorkspaceEntities {
  return {
    installedAppOrder: installedApps.map((app) => app.id),
    installedAppsById: indexInstalledApps(installedApps),
    widgetPreferencesById: indexWidgetPreferences(widgetPreferences),
  };
}

export function getInstalledAppsSnapshot(
  state: Pick<WorkspaceStateData, "installedAppOrder" | "installedAppsById">,
) {
  return state.installedAppOrder
    .map((appId) => state.installedAppsById[appId])
    .filter((app): app is AppRuntimeEntry => Boolean(app));
}

export function getWidgetPreferencesSnapshot(
  state: Pick<WorkspaceStateData, "widgetPreferencesById">,
) {
  return Object.values(state.widgetPreferencesById);
}

export function getWorkspaceErrorMessage(error: unknown): string {
  const maybeError = error as {
    message?: string;
    response?: {
      data?: {
        detail?: string;
        error?: string;
      };
    };
  };

  return (
    maybeError.response?.data?.detail ??
    maybeError.response?.data?.error ??
    maybeError.message ??
    "Failed to refresh workspace."
  );
}

export function createWorkspaceEntitiesState(
  installedApps: AppRuntimeEntry[],
  widgetPreferences: WidgetPreferenceSchema[],
  initialWidgetDataById: Record<string, unknown> = {},
) {
  return {
    initialWidgetDataById,
    installedAppIds: toInstalledAppIds(installedApps),
    ...normalizeWorkspaceEntities(installedApps, widgetPreferences),
  };
}

export const initialWorkspaceState = {
  initialWidgetDataById: {},
  installedAppIds: new Set<string>(),
  installedAppOrder: [],
  installedAppsById: {},
  isWorkspaceLoading: true,
  isWorkspaceRefreshing: false,
  refreshRequestId: 0,
  sessionRevision: 0,
  userId: null,
  widgetPreferencesById: {},
  workspaceError: null,
} satisfies WorkspaceStateData;

export function createEmptyWorkspaceState(
  overrides: Partial<WorkspaceStateData> = {},
): WorkspaceStateData {
  return {
    ...initialWorkspaceState,
    ...overrides,
  };
}

export function reducePreferenceUpdates(
  state: Pick<
    WorkspaceStateData,
    "initialWidgetDataById" | "installedAppOrder" | "installedAppsById" | "widgetPreferencesById"
  >,
  updates: PreferenceUpdate[],
) {
  const widgetPreferences = mergePreferenceUpdates(getWidgetPreferencesSnapshot(state), updates);

  return createWorkspaceEntitiesState(
    getInstalledAppsSnapshot(state),
    widgetPreferences,
    state.initialWidgetDataById,
  );
}

export function createInstalledAppPreferences(
  app: AppCatalogEntry,
  userId: string | null,
  existingPreferences: WidgetPreferenceSchema[],
) {
  const nextPreferences = new Map(
    existingPreferences.map((preference) => [preference.widget_id, preference] as const),
  );

  for (const [index, widget] of (app.widgets ?? []).entries()) {
    if (nextPreferences.has(widget.id)) continue;

    nextPreferences.set(widget.id, {
      _id: null,
      user_id: userId ?? "",
      widget_id: widget.id,
      app_id: app.id,
      enabled: true,
      sort_order: index,
      grid_x: 0,
      grid_y: index * 2,
      size_w: null,
      size_h: null,
    });
  }

  return Array.from(nextPreferences.values());
}

export function removeInstalledAppPreferences(
  appId: string,
  existingPreferences: WidgetPreferenceSchema[],
) {
  return existingPreferences.filter((preference) => preference.app_id !== appId);
}

export function reduceInstalledAppChange(
  state: Pick<
    WorkspaceStateData,
    | "initialWidgetDataById"
    | "installedAppIds"
    | "installedAppOrder"
    | "installedAppsById"
    | "widgetPreferencesById"
    | "userId"
  >,
  app: AppCatalogEntry,
  isInstalled: boolean,
) {
  const runtimeApp = toRuntimeApp(app);
  const installedApps = getInstalledAppsSnapshot(state);
  const widgetPreferences = getWidgetPreferencesSnapshot(state);
  const nextInstalledApps = isInstalled
    ? state.installedAppIds.has(app.id)
      ? installedApps.map((entry) => (entry.id === app.id ? runtimeApp : entry))
      : [...installedApps, runtimeApp]
    : installedApps.filter((entry) => entry.id !== app.id);
  const nextWidgetPreferences = isInstalled
    ? createInstalledAppPreferences(app, state.userId, widgetPreferences)
    : removeInstalledAppPreferences(app.id, widgetPreferences);

  return createWorkspaceEntitiesState(
    nextInstalledApps,
    nextWidgetPreferences,
    state.initialWidgetDataById,
  );
}

export function createHydratedWorkspaceState(
  userId: string,
  sessionRevision: number,
  snapshot: WorkspaceBootstrap | null,
) {
  if (!snapshot) {
    return createEmptyWorkspaceState({
      isWorkspaceLoading: true,
      isWorkspaceRefreshing: false,
      sessionRevision,
      userId,
    });
  }

  return {
    ...createWorkspaceEntitiesState(
      snapshot.installed_apps ?? [],
      snapshot.widget_preferences ?? [],
      snapshot.initial_widget_data ?? {},
    ),
    isWorkspaceLoading: false,
    isWorkspaceRefreshing: false,
    sessionRevision,
    userId,
    workspaceError: null,
  } satisfies Partial<WorkspaceStateData>;
}

export function isActiveRefreshRequest(
  state: Pick<WorkspaceStateData, "refreshRequestId" | "sessionRevision" | "userId">,
  requestId: number,
  sessionRevision: number,
  userId: string,
) {
  return (
    state.refreshRequestId === requestId &&
    state.sessionRevision === sessionRevision &&
    state.userId === userId
  );
}

export function createResetWorkspaceState(sessionRevision: number) {
  clearActiveApps();
  return createEmptyWorkspaceState({
    initialWidgetDataById: {},
    isWorkspaceLoading: false,
    sessionRevision,
  });
}

import type { FrontendAppDefinition } from "./types";

/**
 * Auto-discover all frontend apps using Vite glob import.
 *
 * This enables true plug-n-play: just create a new folder in src/apps/
 * with index.ts that exports a FrontendAppDefinition, and it will be
 * automatically registered without any manual imports.
 *
 * The backend remains the source of truth for all metadata (name, icon, color).
 * Frontend only provides the component implementations (AppView, DashboardWidget).
 */

// Vite glob import - automatically imports all index.ts files from app folders
const appModules = import.meta.glob<{
  default?: FrontendAppDefinition;
  manifest?: { id: string };
}>("./*/index.ts", { eager: true });

// Build the registry dynamically
const registry: Record<string, FrontendAppDefinition> = {};

for (const [path, module] of Object.entries(appModules)) {
  // Extract appId from path: "./finance/index.ts" -> "finance"
  const match = path.match(/^\.\/([^/]+)\/index\.ts$/);
  if (!match) continue;

  const appId = match[1];
  const appDefinition = module.default;

  if (appDefinition) {
    registry[appId] = appDefinition;
  } else {
    console.warn(`[FrontendApps] App "${appId}" found but no default export`);
  }
}

export const FRONTEND_APPS = registry;

/**
 * Get a frontend app definition by its ID.
 * Returns undefined if the app is not implemented in the frontend.
 */
export function getFrontendApp(appId: string): FrontendAppDefinition | undefined {
  return FRONTEND_APPS[appId];
}

/**
 * Check if a frontend app implementation exists for the given app ID.
 */
export function hasFrontendApp(appId: string): boolean {
  return appId in FRONTEND_APPS;
}

/**
 * Get all registered app IDs.
 */
export function getRegisteredAppIds(): string[] {
  return Object.keys(FRONTEND_APPS);
}

// Debug logging in development
if (import.meta.env.DEV) {
  console.log("[FrontendApps] Auto-discovered apps:", getRegisteredAppIds());
}

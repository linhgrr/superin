/**
 * App discovery registers available app-local loaders without importing app metadata.
 */

import { registerAvailableApps, type AppMetadata } from "./lazy-registry";

const appModuleLoaders = import.meta.glob("../apps/*/index.ts");

export function discoverAndRegisterApps(): AppMetadata[] {
  return registerAvailableApps(appModuleLoaders);
}

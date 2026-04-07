/**
 * App discovery registers available app-local loaders without importing app metadata.
 */

import {
  registerAvailableApps,
  type AppMetadata,
  type AppModule,
} from "./lazy-registry";

const appModuleLoaders = import.meta.glob<AppModule>("../apps/*/index.ts");

export function discoverAndRegisterApps(): AppMetadata[] {
  return registerAvailableApps(
    appModuleLoaders as Record<string, () => Promise<AppModule>>
  );
}

export type { AppMetadata };

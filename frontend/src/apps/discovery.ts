/**
 * App Discovery - Auto-detect available apps và tạo lazy loaders
 *
 * Chỉ scan manifest.json files (nhẹ), không import index.ts (tránh eager load components)
 */

import type { FrontendAppManifest } from "./types";
import { registerAppMetadata, createAppLoaders, type AppMetadata } from "./lazy-registry";

/**
 * Manifest cache - chỉ chứa JSON manifests, rất nhẹ
 * Glob chỉ manifest.json với eager: true (manifests are lightweight metadata)
 * Components vẫn được lazy load qua createAppLoaders
 */
const manifestCache = import.meta.glob<{ default: FrontendAppManifest }>(
  "./*/manifest.json",
  { eager: true } // Manifests are lightweight (~100-200 bytes each)
);

/**
 * Scan và đăng ký tất cả apps có sẵn.
 * Chỉ load metadata (đã eager load), không load component code.
 */
export function discoverAndRegisterApps(): AppMetadata[] {
  const registeredApps: AppMetadata[] = [];
  const entries = Object.entries(manifestCache);

  for (const [path, module] of entries) {
    const match = path.match(/^\.\/([^/]+)\//);
    if (!match) continue;

    const appId = match[1];

    try {
      // Manifest đã được eager load, chỉ cần lấy default export
      const manifest = module.default;

      if (!manifest || typeof manifest !== "object" || !manifest.id) {
        continue;
      }

      // Tạo lazy loaders cho app này (components vẫn lazy)
      const loaders = createAppLoaders(appId, `./${appId}/index.ts`);

      // Đăng ký metadata (không có components loaded)
      registerAppMetadata(appId, manifest, loaders);
      registeredApps.push({
        id: appId,
        manifest,
        ...loaders,
      });
    } catch {
      // Skip failed registrations
    }
  }

  return registeredApps;
}

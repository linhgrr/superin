/**
 * App Discovery - Auto-detect available apps và tạo lazy loaders
 *
 * Khác với eager loading cũ, module này chỉ scan để biết app nào khả dụng
 * và tạo lazy loaders, không thực sự import code.
 */

import type { FrontendAppManifest } from "./types";
import { registerAppMetadata, createAppLoaders, type AppMetadata } from "./lazy-registry";

/**
 * Manifest cache - chỉ chứa JSON manifests, rất nhẹ
 */
const manifestCache = import.meta.glob<{
  default: { manifest: FrontendAppManifest };
}>("./*/index.ts", {
  import: "default",
  eager: false, // Chỉ scan, không eager load components
});

/**
 * Scan và đăng ký tất cả apps có sẵn.
 * Chỉ load metadata, không load component code.
 */
export async function discoverAndRegisterApps(): Promise<AppMetadata[]> {
  const registeredApps: AppMetadata[] = [];
  const entries = Object.entries(manifestCache);

  for (const [path, importFn] of entries) {
    const match = path.match(/^\.\/([^/]+)\//);
    if (!match) continue;

    const appId = match[1];

    try {
      // Chỉ load default export để lấy manifest
      const module = await importFn();
      const definition = module.default;

      if (!definition?.manifest) {
        console.warn(`[Discovery] App "${appId}" missing manifest`);
        continue;
      }

      // Tạo lazy loaders cho app này
      const loaders = createAppLoaders(appId, path);

      // Đăng ký metadata (không có components loaded)
      registerAppMetadata(appId, definition.manifest, loaders);
      registeredApps.push({
        id: appId,
        manifest: definition.manifest,
        ...loaders,
      });

      if (import.meta.env.DEV) {
        console.log(`[Discovery] Registered lazy app: ${appId}`);
      }
    } catch (error) {
      console.error(`[Discovery] Failed to register app "${appId}":`, error);
    }
  }

  return registeredApps;
}

/**
 * Lấy danh sách app paths để có thể tạo dynamic imports.
 */
export function getAvailableAppPaths(): Record<string, string> {
  const paths: Record<string, string> = {};

  for (const path of Object.keys(manifestCache)) {
    const match = path.match(/^\.\/([^/]+)\//);
    if (match) {
      paths[match[1]] = path;
    }
  }

  return paths;
}

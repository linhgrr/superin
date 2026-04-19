/**
 * App discovery registers available app-local loaders without importing app metadata.
 */

import type { ComponentType } from "react";

import {
  registerAvailableApps,
  type AppMetadata,
  type AppViewModule,
  type DashboardWidgetModule,
} from "./lazy-registry";
import type { DashboardWidgetProps } from "./types";

const appViewScreenLoaders = import.meta.glob<AppViewModule>("../apps/*/views/*Screen.tsx");
const dashboardWidgetLoaders =
  import.meta.glob<DashboardWidgetModule>("../apps/*/DashboardWidget.tsx");

export function discoverAndRegisterApps(): AppMetadata[] {
  return registerAvailableApps(
    appViewScreenLoaders as Record<string, () => Promise<{ default: ComponentType }>>,
    dashboardWidgetLoaders as Record<
      string,
      () => Promise<{ default: ComponentType<DashboardWidgetProps> }>
    >
  );
}

export type { AppMetadata };

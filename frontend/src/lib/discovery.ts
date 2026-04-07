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

const appViewLoaders = import.meta.glob<AppViewModule>("../apps/*/AppView.tsx");
const dashboardWidgetLoaders =
  import.meta.glob<DashboardWidgetModule>("../apps/*/DashboardWidget.tsx");

export function discoverAndRegisterApps(): AppMetadata[] {
  return registerAvailableApps(
    appViewLoaders as Record<string, () => Promise<{ default: ComponentType }>>,
    dashboardWidgetLoaders as Record<
      string,
      () => Promise<{ default: ComponentType<DashboardWidgetProps> }>
    >
  );
}

export type { AppMetadata };

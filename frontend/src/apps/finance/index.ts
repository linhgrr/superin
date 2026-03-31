import manifest from "./manifest.json";
import AppView from "./AppView";
import DashboardWidget from "./DashboardWidget";
import type { FrontendAppDefinition, FrontendAppManifest } from "../types";

const financeManifest = manifest as FrontendAppManifest;

export const financeApp = {
  manifest: financeManifest,
  AppView,
  DashboardWidget,
} satisfies FrontendAppDefinition;

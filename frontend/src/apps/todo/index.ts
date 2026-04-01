import manifest from "./manifest.json";
import AppView from "./AppView";
import DashboardWidget from "./DashboardWidget";
import type { FrontendAppDefinition, FrontendAppManifest } from "../types";

const todoManifest = manifest as FrontendAppManifest;

const todoApp = {
  manifest: todoManifest,
  AppView,
  DashboardWidget,
} satisfies FrontendAppDefinition;

export default todoApp;

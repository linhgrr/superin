import manifest from "./manifest.json";
import AppView from "./AppView";
import DashboardWidget from "./DashboardWidget";
import type { FrontendAppDefinition, FrontendAppManifest } from "../types";

const calendarManifest = manifest as FrontendAppManifest;

const calendarApp = {
  manifest: calendarManifest,
  AppView,
  DashboardWidget,
} satisfies FrontendAppDefinition;

export default calendarApp;

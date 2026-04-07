/**
 * Shared app-facing types bridge.
 *
 * Subapps import from "../types" to avoid coupling to platform internals.
 */

export type {
  DashboardWidgetProps,
  DashboardWidgetRendererProps,
  FrontendAppDefinition,
  FrontendAppManifest,
  FrontendWidgetManifest,
} from "@/lib/types";

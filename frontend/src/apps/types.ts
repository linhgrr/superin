/**
 * Shared app-facing types bridge.
 *
 * Subapps import from "../types" to avoid coupling to platform internals.
 */

export type {
  DashboardWidgetComponentMap,
  DashboardWidgetProps,
  DashboardWidgetRendererProps,
} from "@/lib/types";

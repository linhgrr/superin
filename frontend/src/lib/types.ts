import type { ComponentType } from "react";
import type { WidgetManifestSchema } from "@/types/generated";

export interface DashboardWidgetProps {
  widgetId: string;
  widget: WidgetManifestSchema;
}

export interface DashboardWidgetRendererProps {
  widget: WidgetManifestSchema;
}

export interface DashboardWidgetComponentMap {
  [widgetId: string]: ComponentType<DashboardWidgetRendererProps>;
}

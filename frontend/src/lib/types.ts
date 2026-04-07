import type { ComponentType } from "react";
import type { WidgetManifestSchema } from "@/types/generated";
import type { WidgetSizeName } from "@/lib/widget-sizes";

export interface FrontendWidgetManifest {
  id: string;
  size: WidgetSizeName;
}

export interface FrontendAppManifest {
  id: string;
  name: string;
  widgets: FrontendWidgetManifest[];
}

export interface DashboardWidgetProps {
  widgetId: string;
  widget: WidgetManifestSchema;
}

export interface DashboardWidgetRendererProps {
  widget: WidgetManifestSchema;
}

export interface FrontendAppDefinition {
  manifest: FrontendAppManifest;
  AppView: ComponentType;
  DashboardWidget: ComponentType<DashboardWidgetProps>;
}

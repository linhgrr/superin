import type { ComponentType } from "react";
import type { AppCatalogEntry } from "@/types/generated/api";
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
  widget: AppCatalogEntry["widgets"][number];
}

export interface DashboardWidgetRendererProps {
  widget: AppCatalogEntry["widgets"][number];
}

export interface FrontendAppDefinition {
  manifest: FrontendAppManifest;
  AppView: ComponentType;
  DashboardWidget: ComponentType<DashboardWidgetProps>;
}

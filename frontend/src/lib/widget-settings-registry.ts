/**
 * Widget settings registry — allows apps to register settings modals for configurable widgets.
 *
 * Usage:
 *   registerWidgetSettings("finance.total-balance", TotalBalanceWidgetSettings);
 *   const Settings = getWidgetSettings("finance.total-balance");
 */

import type { ComponentType } from "react";

export interface WidgetSettingsProps {
  widgetId: string;
  currentConfig: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onClose: () => void;
}

const REGISTRY = new Map<string, ComponentType<WidgetSettingsProps>>();

export function registerWidgetSettings(
  widgetId: string,
  component: ComponentType<WidgetSettingsProps>
): void {
  REGISTRY.set(widgetId, component);
}

export function getWidgetSettings(
  widgetId: string
): ComponentType<WidgetSettingsProps> | undefined {
  return REGISTRY.get(widgetId);
}

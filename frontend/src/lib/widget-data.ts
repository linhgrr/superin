import useSWR from "swr";
import type { SWRConfiguration } from "swr";

import { swrConfig } from "@/lib/swr";
import type { WidgetDataConfigUpdate } from "@/types/generated";

export const WIDGET_DATA_REFRESH_INTERVAL_MS = 60_000;

export function createWidgetDataKey(appId: string, widgetId: string) {
  return [`${appId}/widget`, widgetId] as const;
}

export function useWidgetData<T>(
  appId: string,
  widgetId: string,
  fetcher: () => Promise<T>,
  config?: Partial<SWRConfiguration>
) {
  return useSWR<T>(createWidgetDataKey(appId, widgetId), fetcher, {
    refreshInterval: WIDGET_DATA_REFRESH_INTERVAL_MS,
    ...swrConfig,
    ...config,
  });
}

export function buildWidgetConfigUpdate(
  widgetId: string,
  config: WidgetDataConfigUpdate["config"]
): WidgetDataConfigUpdate {
  return {
    widget_id: widgetId,
    config,
  };
}

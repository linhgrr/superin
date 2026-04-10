/**
 * WidgetContent — thin wrapper that delegates to LazyWidget.
 */

import LazyWidget from "@/components/LazyWidget";
import type { WidgetManifestSchema } from "@/types/generated";

interface WidgetContentProps {
  appId: string;
  widgetId: string;
  widget: WidgetManifestSchema;
}

export default function WidgetContent({
  appId,
  widgetId,
  widget,
}: WidgetContentProps) {
  return (
    <LazyWidget appId={appId} widgetId={widgetId} widget={widget} />
  );
}

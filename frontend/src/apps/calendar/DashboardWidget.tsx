import type { WidgetManifestSchema } from "@/types/generated/api";
import { MonthViewWidget } from "./widgets/MonthViewWidget";
import { UpcomingWidget } from "./widgets/UpcomingWidget";
import { DaySummaryWidget } from "./widgets/DaySummaryWidget";

interface DashboardWidgetProps {
  widgetId: string;
  widget: WidgetManifestSchema;
}

export default function DashboardWidget({ widgetId }: DashboardWidgetProps) {
  switch (widgetId) {
    case "calendar.month-view":
      return <MonthViewWidget />;

    case "calendar.upcoming":
      return <UpcomingWidget maxItems={5} />;

    case "calendar.day-summary":
      return <DaySummaryWidget />;

    default:
      return (
        <div style={{ padding: "1rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
          Unknown widget: {widgetId}
        </div>
      );
  }
}

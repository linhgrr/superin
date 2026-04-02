/**
 * WidgetSkeleton - Loading state cho widget
 */

import { WIDGET_SIZES } from "@/lib/widget-sizes";

interface WidgetSkeletonProps {
  size?: string;
}

export default function WidgetSkeleton({ size = "standard" }: WidgetSkeletonProps) {
  const config = WIDGET_SIZES[size as keyof typeof WIDGET_SIZES] ?? WIDGET_SIZES.standard;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        height: "100%",
        padding: "0.5rem",
      }}
    >
      {/* Title skeleton */}
      <div
        style={{
          height: "20px",
          width: "60%",
          background: "var(--color-surface-elevated)",
          borderRadius: "6px",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      {/* Content skeleton */}
      <div
        style={{
          flex: 1,
          background: "var(--color-surface-elevated)",
          borderRadius: "8px",
          animation: "pulse 1.5s ease-in-out 0.2s infinite",
        }}
      />
    </div>
  );
}

/**
 * WidgetCard — card wrapper for dashboard widgets.
 * Adds a mouse-tracking gradient sheen effect.
 */

import { memo, useState } from "react";
import type { WidgetManifestSchema } from "@/types/generated";

interface WidgetCardProps {
  widget: WidgetManifestSchema;
  children: React.ReactNode;
}

const WidgetCard = memo(function WidgetCard({
  widget,
  children,
}: WidgetCardProps) {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  return (
    <div
      className="widget-card"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }}
      style={{
        "--mouse-x": `${mousePos.x}%`,
        "--mouse-y": `${mousePos.y}%`,
        display: "flex",
        flexDirection: "column",
      } as React.CSSProperties}
    >
      <div className="widget-card-title" style={{ flexShrink: 0 }}>
        {widget.name}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
});

export default WidgetCard;

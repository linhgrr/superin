/**
 * AddWidgetDialog — 2-step widget manager.
 */

import { useEffect, useRef, useState } from "react";
import type { AppRuntimeEntry } from "@/types/generated";
import { AppListPanel } from "./AppListPanel";
import { WidgetListPanel } from "./WidgetListPanel";

export interface AddWidgetDialogProps {
  catalog: AppRuntimeEntry[];
  enabledWidgetIds: ReadonlySet<string>;
  busyWidgetId?: string | null;
  onToggleWidget: (widgetId: string, enabled: boolean) => Promise<void> | void;
  onClose: () => void;
}

export default function AddWidgetDialog({
  catalog,
  enabledWidgetIds,
  busyWidgetId,
  onToggleWidget,
  onClose,
}: AddWidgetDialogProps) {
  const [selectedApp, setSelectedApp] = useState<AppRuntimeEntry | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => { panelRef.current?.focus(); }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={selectedApp ? `${selectedApp.name} widgets` : "Add Widget"}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: selectedApp ? "480px" : "420px" }}
      >
        {selectedApp ? (
          <WidgetListPanel
            app={selectedApp}
            enabledWidgetIds={enabledWidgetIds}
            busyWidgetId={busyWidgetId}
            onToggleWidget={onToggleWidget}
            onBack={() => setSelectedApp(null)}
            onClose={onClose}
          />
        ) : (
          <AppListPanel
            catalog={catalog}
            enabledWidgetIds={enabledWidgetIds}
            onSelectApp={setSelectedApp}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

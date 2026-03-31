/**
 * useDashboardEdit — global dashboard edit mode state via React context.
 *
 * Provides:
 *   isEditMode, pendingChanges,
 *   enterEditMode, exitEditMode, discardChanges,
 *   toggleWidget, moveWidget, getWidgetPosition
 */

import { createContext, useCallback, useContext, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WidgetChange {
  enabled?: boolean;
  position?: number;
}

interface DashboardEditContextValue {
  isEditMode: boolean;
  pendingChanges: Map<string, WidgetChange>;
  enterEditMode: () => void;
  exitEditMode: () => void;
  discardChanges: () => void;
  toggleWidget: (widgetId: string, enabled: boolean) => void;
  moveWidget: (widgetId: string, newPosition: number) => void;
  getWidgetPosition: (widgetId: string) => number | undefined;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const DashboardEditContext = createContext<DashboardEditContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function DashboardEditProvider({ children }: { children: React.ReactNode }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, WidgetChange>>(new Map());

  const enterEditMode = () => setIsEditMode(true);
  const exitEditMode = () => setIsEditMode(false);

  const discardChanges = useCallback(() => {
    setPendingChanges(new Map());
    setIsEditMode(false);
  }, []);

  const setWidgetChange = useCallback((widgetId: string, change: WidgetChange) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(widgetId, { ...next.get(widgetId), ...change });
      return next;
    });
  }, []);

  const toggleWidget = useCallback((widgetId: string, enabled: boolean) => {
    setWidgetChange(widgetId, { enabled });
  }, [setWidgetChange]);

  const moveWidget = useCallback((widgetId: string, newPosition: number) => {
    setWidgetChange(widgetId, { position: newPosition });
  }, [setWidgetChange]);

  const getWidgetPosition = useCallback(
    (widgetId: string): number | undefined => {
      return pendingChanges.get(widgetId)?.position;
    },
    [pendingChanges]
  );

  return (
    <DashboardEditContext.Provider value={{
      isEditMode,
      pendingChanges,
      enterEditMode,
      exitEditMode,
      discardChanges,
      toggleWidget,
      moveWidget,
      getWidgetPosition,
    }}>
      {children}
    </DashboardEditContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardEdit(): DashboardEditContextValue {
  const ctx = useContext(DashboardEditContext);
  if (!ctx) {
    throw new Error("useDashboardEdit must be used within <DashboardEditProvider>");
  }
  return ctx;
}

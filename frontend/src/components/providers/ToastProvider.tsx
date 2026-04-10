/**
 * ToastProvider — toast notification context.
 */

import { createContext, ReactNode, useContext, useCallback, useState, useMemo } from "react";
import { ToastItem } from "./ToastItem";
import type { Toast, ToastContextValue, ToastVariant } from "./toast-types";

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 5;

const TOAST_CONTAINER_STYLE = {
  position: "fixed" as const,
  bottom: "1.5rem",
  right: "1.5rem",
  zIndex: 9999,
  display: "flex" as const,
  flexDirection: "column" as const,
  gap: "0.75rem",
};

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (variant: ToastVariant, title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newToast: Toast = { id, variant, title, ...opts };
      setToasts((prev) => {
        const next = [...prev, newToast];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
    },
    []
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (title, opts) => addToast("success", title, opts),
        error: (title, opts) => addToast("error", title, opts),
        warning: (title, opts) => addToast("warning", title, opts),
        info: (title, opts) => addToast("info", title, opts),
        dismiss,
      },
    }),
    [addToast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={TOAST_CONTAINER_STYLE}>
        {toasts.map((toast, index) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <ToastItem toast={toast} onDismiss={dismiss} index={index} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return context.toast;
}

export { ToastProvider };
export type { Toast, ToastVariant, ToastAction } from "./toast-types";
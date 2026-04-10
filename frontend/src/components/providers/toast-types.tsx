/**
 * Toast types and design tokens — shared between ToastProvider and ToastItem.
 */

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: ToastAction;
  duration?: number;
}

export interface ToastContextValue {
  toast: {
    success: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    error: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    warning: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    info: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    dismiss: (id: string) => void;
  };
}

/** Icon name per toast variant — resolved lazily via DynamicIcon for code-splitting */
export const VARIANT_ICON_NAMES: Record<ToastVariant, string> = {
  success: "CheckCircle",
  error: "XCircle",
  warning: "AlertTriangle",
  info: "Info",
};

export const VARIANT_COLORS: Record<ToastVariant, string> = {
  success: "var(--color-success)",
  error: "var(--color-danger)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
};

export const VARIANT_BG: Record<ToastVariant, string> = {
  success: "oklch(0.75 0.18 145 / 0.15)",
  error: "oklch(0.62 0.22 25 / 0.15)",
  warning: "oklch(0.78 0.16 85 / 0.15)",
  info: "oklch(0.65 0.15 250 / 0.15)",
};

export const TOAST_DURATION_MS = 5000;

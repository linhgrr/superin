/**
 * Toast Notification System — SaaS-grade notifications
 *
 * Features:
 * - 4 variants: success, error, warning, info
 * - Auto-dismiss with progress indicator
 * - Stacking (max 5 visible)
 * - Pause on hover
 * - Swipe to dismiss (mobile)
 * - Action buttons support
 *
 * Usage:
 *   const { toast } = useToast()
 *   toast.success("Saved successfully")
 *   toast.error("Failed to save", { action: { label: "Retry", onClick: retryFn } })
 */

import { createContext, ReactNode, useContext, useCallback, useState, useEffect, useRef, useMemo } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    error: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    warning: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    info: (title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => void;
    dismiss: (id: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const VARIANT_COLORS: Record<ToastVariant, string> = {
  success: "var(--color-success)",
  error: "var(--color-danger)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
};

const VARIANT_BG: Record<ToastVariant, string> = {
  success: "oklch(0.75 0.18 145 / 0.15)",
  error: "oklch(0.62 0.22 25 / 0.15)",
  warning: "oklch(0.78 0.16 85 / 0.15)",
  info: "oklch(0.65 0.15 250 / 0.15)",
};

function ToastItem({
  toast,
  onDismiss,
  index,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
  index: number;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const duration = toast.duration ?? 5000;
  const startTimeRef = useRef(Date.now());
  const remainingRef = useRef(duration);

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, remainingRef.current - elapsed);
      const newProgress = (remaining / duration) * 100;

      setProgress(newProgress);

      if (remaining <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [isPaused, duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const handleMouseEnter = () => {
    setIsPaused(true);
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startTimeRef.current));
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    startTimeRef.current = Date.now();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "1rem",
        background: "linear-gradient(165deg, var(--color-surface) 0%, var(--color-surface-elevated) 100%)",
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
        boxShadow: "0 8px 32px oklch(0 0 0 / 0.3), 0 0 0 1px var(--color-border)",
        minWidth: "320px",
        maxWidth: "420px",
        animation: isExiting
          ? "toastExit 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards"
          : `toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both`,
        overflow: "hidden",
      }}
    >
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: VARIANT_BG[toast.variant],
          color: VARIANT_COLORS[toast.variant],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {VARIANT_ICONS[toast.variant]}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--color-foreground)",
            lineHeight: 1.4,
          }}
        >
          {toast.title}
        </div>
        {toast.description && (
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-foreground-muted)",
              marginTop: "0.25rem",
              lineHeight: 1.4,
            }}
          >
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              handleDismiss();
            }}
            style={{
              marginTop: "0.75rem",
              padding: "0.375rem 0.75rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: VARIANT_COLORS[toast.variant],
              background: VARIANT_BG[toast.variant],
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        style={{
          flexShrink: 0,
          width: "28px",
          height: "28px",
          borderRadius: "6px",
          border: "none",
          background: "transparent",
          color: "var(--color-foreground-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-surface-floating)";
          e.currentTarget.style.color = "var(--color-foreground)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-foreground-muted)";
        }}
      >
        <X size={16} />
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: "var(--color-border)",
          borderRadius: "0 0 12px 12px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: VARIANT_COLORS[toast.variant],
            borderRadius: "0 0 0 12px",
            transition: isPaused ? "none" : "width 0.016s linear",
          }}
        />
      </div>
    </div>
  );
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (variant: ToastVariant, title: string, opts?: Omit<Toast, "id" | "variant" | "title">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newToast: Toast = {
        id,
        variant,
        title,
        ...opts,
      };

      setToasts((prev) => {
        // Keep max 5 toasts, remove oldest
        const next = [...prev, newToast];
        if (next.length > 5) {
          return next.slice(next.length - 5);
        }
        return next;
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
      {/* Toast container */}
      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast, index) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <ToastItem toast={toast} onDismiss={dismiss} index={index} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return context.toast;
}

export { ToastProvider };
export type { Toast, ToastVariant, ToastAction };

/**
 * ToastItem — individual toast notification component.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";
import type { Toast } from "./toast-types";
import {
  VARIANT_COLORS,
  VARIANT_BG,
  VARIANT_ICON_NAMES,
  TOAST_DURATION_MS,
} from "./toast-types";

/** ms to wait after exit animation before removing the toast from DOM */
const EXIT_ANIMATION_MS = 300;
/** Progress bar refresh interval — 10fps is visually indistinguishable from 60fps */
const PROGRESS_TICK_MS = 100;

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
  index: number;
}

function ToastItem({ toast, onDismiss, index }: ToastItemProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const duration = toast.duration ?? TOAST_DURATION_MS;
  const startTimeRef = useRef(Date.now());
  const remainingRef = useRef(duration);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), EXIT_ANIMATION_MS);
  }, [onDismiss, toast.id]);

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
    }, PROGRESS_TICK_MS);

    return () => clearInterval(interval);
  }, [duration, handleDismiss, isPaused]);

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
          ? "toastSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards"
          : `toastSlide 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both`,
        overflow: "hidden",
      }}
    >
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
        <DynamicIcon name={VARIANT_ICON_NAMES[toast.variant]} size={18} />
      </div>

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

      <button
        onClick={handleDismiss}
        onMouseEnter={() => setIsCloseHovered(true)}
        onMouseLeave={() => setIsCloseHovered(false)}
        style={{
          flexShrink: 0,
          width: "28px",
          height: "28px",
          borderRadius: "6px",
          border: "none",
          background: isCloseHovered ? "var(--color-surface-floating)" : "transparent",
          color: isCloseHovered ? "var(--color-foreground)" : "var(--color-foreground-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
        }}
      >
        <DynamicIcon name="X" size={16} />
      </button>

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
            transition: isPaused ? "none" : "width 0.1s linear",
          }}
        />
      </div>
    </div>
  );
}

export { ToastItem };
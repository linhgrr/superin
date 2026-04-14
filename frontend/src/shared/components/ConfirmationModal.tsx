import React, { ReactNode } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";

interface ConfirmationModalProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "primary";
}

export function ConfirmationModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "primary",
}: ConfirmationModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1.5rem",
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "rgba(0, 0, 0, 0.5) 0px 16px 48px",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--color-foreground)" }}>
            {title}
          </h3>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-foreground-subtle)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
            }}
          >
            <DynamicIcon name="X" size={18} />
          </button>
        </div>

        <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", lineHeight: 1.5 }}>
          {message}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-foreground)",
              fontSize: "0.875rem",
              fontWeight: 510,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "8px",
              border: "none",
              background: variant === "danger" ? "var(--color-danger)" : "var(--color-primary)",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 510,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

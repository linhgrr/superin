import type { ReactNode } from "react";

import { AppModal } from "@/shared/components/AppModal";

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
    <AppModal title={title} onClose={onCancel} maxWidth={400}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", lineHeight: 1.5 }}>
          {message}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
          <button
            type="button"
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
            type="button"
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
    </AppModal>
  );
}

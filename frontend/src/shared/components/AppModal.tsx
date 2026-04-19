import type { CSSProperties, ReactNode } from "react";

import { DynamicIcon } from "@/lib/icon-resolver";

interface AppModalProps {
  children: ReactNode;
  closeDisabled?: boolean;
  closeOnBackdropClick?: boolean;
  contentStyle?: CSSProperties;
  description?: ReactNode;
  maxWidth?: number | string;
  onClose: () => void;
  title: ReactNode;
}

export function AppModal({
  children,
  closeDisabled = false,
  closeOnBackdropClick = true,
  contentStyle,
  description,
  maxWidth = 480,
  onClose,
  title,
}: AppModalProps) {
  function handleClose() {
    if (!closeDisabled) {
      onClose();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1.5rem",
      }}
      onClick={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          boxShadow: "rgba(0, 0, 0, 0.45) 0px 18px 48px",
          padding: "1.5rem",
          ...contentStyle,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--color-foreground)",
              }}
            >
              {title}
            </h2>
            {description ? (
              <p
                style={{
                  margin: "0.375rem 0 0",
                  fontSize: "0.875rem",
                  color: "var(--color-foreground-muted)",
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClose}
            disabled={closeDisabled}
            style={{ padding: "0.25rem" }}
            aria-label="Close"
          >
            <DynamicIcon name="X" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

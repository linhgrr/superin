import { DynamicIcon } from "@/lib/icon-resolver";

type FinancePanelStateVariant = "empty" | "error" | "loading";

interface FinancePanelStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  variant: FinancePanelStateVariant;
}

const STATE_ICON: Record<FinancePanelStateVariant, "AlertTriangle" | "Inbox" | "Loader2"> = {
  empty: "Inbox",
  error: "AlertTriangle",
  loading: "Loader2",
};

const STATE_ICON_COLOR: Record<FinancePanelStateVariant, string> = {
  empty: "var(--color-foreground-muted)",
  error: "var(--color-danger)",
  loading: "var(--color-foreground-muted)",
};

export default function FinancePanelState({
  description,
  onRetry,
  title,
  variant,
}: FinancePanelStateProps) {
  const iconName = STATE_ICON[variant];
  const iconColor = STATE_ICON_COLOR[variant];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "1.5rem",
        minHeight: "180px",
        textAlign: "center",
        background: "var(--color-surface-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "0.75rem",
      }}
    >
      <DynamicIcon
        name={iconName}
        size={22}
        style={{
          color: iconColor,
          animation: variant === "loading" ? "spin 1s linear infinite" : undefined,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxWidth: "280px" }}>
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: variant === "error" ? "var(--color-danger)" : "var(--color-foreground)",
          }}
        >
          {title}
        </div>
        {description && (
          <div style={{ fontSize: "0.8125rem", color: "var(--color-foreground-muted)" }}>
            {description}
          </div>
        )}
      </div>
      {variant === "error" && onRetry && (
        <button className="btn btn-ghost" onClick={onRetry} type="button">
          Retry
        </button>
      )}
    </div>
  );
}

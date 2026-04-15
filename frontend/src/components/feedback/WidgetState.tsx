import { DynamicIcon } from "@/lib/icon-resolver";

type WidgetStateVariant = "empty" | "error" | "loading";

interface WidgetStateProps {
  description?: string;
  onRetry?: () => void;
  title: string;
  variant: WidgetStateVariant;
}

const STATE_ICON: Record<WidgetStateVariant, "AlertTriangle" | "Inbox" | "Loader2"> = {
  empty: "Inbox",
  error: "AlertTriangle",
  loading: "Loader2",
};

const STATE_ICON_COLOR: Record<WidgetStateVariant, string> = {
  empty: "var(--color-foreground-muted)",
  error: "var(--color-danger)",
  loading: "var(--color-foreground-muted)",
};

export default function WidgetState({
  description,
  onRetry,
  title,
  variant,
}: WidgetStateProps) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        textAlign: "center",
        padding: "0.75rem",
      }}
    >
      <DynamicIcon
        name={STATE_ICON[variant]}
        size={18}
        style={{
          color: STATE_ICON_COLOR[variant],
          animation: variant === "loading" ? "spin 1s linear infinite" : undefined,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.1875rem", maxWidth: "220px" }}>
        <div
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: variant === "error" ? "var(--color-danger)" : "var(--color-foreground)",
          }}
        >
          {title}
        </div>
        {description && (
          <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
            {description}
          </div>
        )}
      </div>
      {variant === "error" && onRetry && (
        <button className="btn btn-ghost" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

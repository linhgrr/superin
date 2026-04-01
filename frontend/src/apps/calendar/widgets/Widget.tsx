import { ReactNode } from "react";

interface WidgetProps {
  title?: string;
  children: ReactNode;
  isLoading?: boolean;
}

export default function Widget({ title, children, isLoading }: WidgetProps) {
  if (isLoading) {
    return (
      <div style={{ padding: "1rem", textAlign: "center" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            border: "2px solid var(--color-border)",
            borderTopColor: "var(--color-primary)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ height: "100%" }}>
      {title && (
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--color-foreground-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.75rem",
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

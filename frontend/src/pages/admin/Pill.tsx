export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.2rem 0.5rem",
        borderRadius: "999px",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        color: "var(--color-foreground-muted)",
      }}
    >
      {children}
    </span>
  );
}
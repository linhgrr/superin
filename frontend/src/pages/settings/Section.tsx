/**
 * Section — reusable settings section wrapper with icon, title, and description.
 */

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function Section({ icon, title, description, children }: SectionProps) {
  return (
    <section
      style={{
        background: "linear-gradient(165deg, var(--color-surface) 0%, var(--color-surface-elevated) 100%)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: description ? "0.5rem" : "1.25rem",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "var(--color-primary-muted)",
            color: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--color-foreground)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      {description && (
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-foreground-muted)",
            marginBottom: "1.25rem",
            marginTop: 0,
          }}
        >
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

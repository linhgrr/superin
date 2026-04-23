/**
 * Toggle — custom toggle switch for boolean settings.
 */

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export default function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 500,
            color: "var(--color-foreground)",
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-foreground-muted)",
              marginTop: "0.25rem",
            }}
          >
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-label={label}
        role="switch"
        aria-checked={checked}
        style={{
          width: "48px",
          height: "26px",
          borderRadius: "13px",
          border: "none",
          background: checked ? "var(--color-primary)" : "var(--color-border)",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s ease",
        }}
      >
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "white",
            position: "absolute",
            top: "2px",
            left: checked ? "calc(100% - 24px)" : "2px",
            transition: "left 0.2s ease",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        />
      </button>
    </div>
  );
}

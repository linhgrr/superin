/**
 * Select — segmented control for mutually exclusive options.
 */

interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  label: string;
}

export default function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: SelectProps<T>) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--color-foreground-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.625rem 1rem",
              borderRadius: "10px",
              border: "1px solid",
              borderColor:
                value === opt.value ? "var(--color-primary)" : "var(--color-border)",
              background:
                value === opt.value
                  ? "var(--color-primary-muted)"
                  : "var(--color-surface)",
              color:
                value === opt.value ? "var(--color-primary)" : "var(--color-foreground)",
              fontSize: "0.875rem",
              fontWeight: value === opt.value ? 600 : 500,
              cursor: "pointer",
              transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

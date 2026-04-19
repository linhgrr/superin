import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ReactNode,
} from "react";

const LABEL_STYLE = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--color-foreground-muted)",
  marginBottom: "0.375rem",
} as const satisfies CSSProperties;

const CONTROL_STYLE = {
  width: "100%",
  padding: "0.75rem",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  background: "var(--color-surface-elevated)",
  color: "var(--color-foreground)",
  fontSize: "0.875rem",
} as const satisfies CSSProperties;

const VALUE_STYLE = {
  ...CONTROL_STYLE,
  minHeight: "2.875rem",
  display: "flex",
  alignItems: "center",
  fontWeight: 500,
} as const satisfies CSSProperties;

export const FORM_STACK_STYLE = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
} as const satisfies CSSProperties;

export const FORM_ACTIONS_STYLE = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.75rem",
  marginTop: "0.5rem",
} as const satisfies CSSProperties;

interface FormFieldProps {
  children: ReactNode;
  helper?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
  required?: boolean;
}

export function FormField({
  children,
  helper,
  htmlFor,
  label,
  required = false,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} style={LABEL_STYLE}>
        {label}
        {required ? " *" : ""}
      </label>
      {children}
      {helper ? (
        <div
          style={{
            marginTop: "0.375rem",
            fontSize: "0.75rem",
            color: "var(--color-foreground-muted)",
          }}
        >
          {helper}
        </div>
      ) : null}
    </div>
  );
}

export function FormInput({
  style,
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return <input {...props} style={{ ...CONTROL_STYLE, ...style }} />;
}

export function FormSelect({
  style,
  ...props
}: ComponentPropsWithoutRef<"select">) {
  return <select {...props} style={{ ...CONTROL_STYLE, ...style }} />;
}

export function FormTextarea({
  style,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea
      {...props}
      style={{ ...CONTROL_STYLE, resize: "vertical", ...style }}
    />
  );
}

export function FormValue({ children }: { children: ReactNode }) {
  return <div style={VALUE_STYLE}>{children}</div>;
}

interface FormCheckboxProps {
  checked: boolean;
  disabled?: boolean;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}

export function FormCheckbox({
  checked,
  disabled = false,
  label,
  onChange,
}: FormCheckboxProps) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.875rem",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: "auto", margin: 0, cursor: disabled ? "not-allowed" : "pointer" }}
      />
      {label}
    </label>
  );
}

export function FormMessage({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "muted";
}) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: "0.875rem",
        color:
          tone === "error"
            ? "var(--color-danger)"
            : "var(--color-foreground-muted)",
      }}
    >
      {children}
    </p>
  );
}

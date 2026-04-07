import { useState } from "react";
import type { FormEvent } from "react";

export interface SimpleFormField {
  label: string;
  key: string;
  type?: string;
  placeholder?: string;
}

interface SimpleFormProps {
  fields: SimpleFormField[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}

export default function SimpleForm({
  fields,
  submitLabel,
  onSubmit,
}: SimpleFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {fields.map((field) => (
        <div key={field.key}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-foreground-muted)",
            }}
          >
            {field.label}
          </label>
          <input
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            value={values[field.key] ?? ""}
            onChange={(event) =>
              setValues((current) => ({ ...current, [field.key]: event.target.value }))
            }
            required
          />
        </div>
      ))}
      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: "0.875rem", margin: 0 }}>{error}</p>
      )}
      <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: "center" }}>
        {loading ? "…" : submitLabel}
      </button>
    </form>
  );
}

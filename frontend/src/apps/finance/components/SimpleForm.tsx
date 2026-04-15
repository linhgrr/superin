import { useState } from "react";
import type { FormEvent } from "react";

import { useAsyncTask } from "@/hooks/useAsyncTask";

export interface SimpleFormField {
  label: string;
  key: string;
  type?: string;
  initialValue?: string;
  options?: Array<{
    label: string;
    value: string;
  }>;
  placeholder?: string;
  required?: boolean;
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
  const [values, setValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        fields.map((field) => [field.key, field.initialValue ?? ""])
      )
  );
  const [error, setError] = useState<string | null>(null);
  const { isPending: loading, run } = useAsyncTask();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const normalizedValues = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, value.trim()])
      );
      await run(() => onSubmit(normalizedValues));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
          {field.options ? (
            <select
              value={values[field.key] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              required={field.required ?? true}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type ?? "text"}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              required={field.required ?? true}
            />
          )}
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

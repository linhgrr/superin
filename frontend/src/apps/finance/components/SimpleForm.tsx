import { useState } from "react";
import type { FormEvent } from "react";

import { useAsyncTask } from "@/hooks/useAsyncTask";
import {
  FORM_STACK_STYLE,
  FormField,
  FormInput,
  FormMessage,
  FormSelect,
} from "@/shared/components/FormControls";

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
    <form onSubmit={handleSubmit} style={FORM_STACK_STYLE}>
      {fields.map((field) => (
        <FormField
          key={field.key}
          label={field.label}
          htmlFor={field.key}
          required={field.required ?? true}
        >
          {field.options ? (
            <FormSelect
              id={field.key}
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
            </FormSelect>
          ) : (
            <FormInput
              id={field.key}
              type={field.type ?? "text"}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              required={field.required ?? true}
            />
          )}
        </FormField>
      ))}
      {error && (
        <FormMessage>{error}</FormMessage>
      )}
      <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: "center" }}>
        {loading ? "…" : submitLabel}
      </button>
    </form>
  );
}

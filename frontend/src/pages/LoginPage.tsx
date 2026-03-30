/**
 * LoginPage — /login
 *
 * Tabs: Login / Register.
 * Validates email + password, shows inline errors, redirects on success.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/api/client";
import { APP_NAME } from "@/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  email: string;
  password: string;
  name?: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
  name?: string;
  global?: string;
}

// ─── Validators ───────────────────────────────────────────────────────────────

function validateLoginForm(f: FormState): FieldErrors {
  const errs: FieldErrors = {};
  if (!f.email) errs.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
    errs.email = "Enter a valid email address";
  if (!f.password) errs.password = "Password is required";
  return errs;
}

function validateRegisterForm(f: FormState): FieldErrors {
  const errs: FieldErrors = {};
  if (!f.name?.trim()) errs.name = "Name is required";
  if (!f.email) errs.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
    errs.email = "Enter a valid email address";
  if (!f.password) errs.password = "Password is required";
  else if (f.password.length < 8)
    errs.password = "Password must be at least 8 characters";
  return errs;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span
      style={{
        display: "block",
        marginTop: "0.25rem",
        fontSize: "0.75rem",
        color: "var(--color-danger)",
      }}
    >
      {msg}
    </span>
  );
}

function FormInput({
  label,
  id,
  type = "text",
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <label
        htmlFor={id}
        style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-muted)" }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={error ? { borderColor: "var(--color-danger)" } : {}}
      />
      <FieldError msg={error} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({ email: "", password: "", name: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField(field: keyof FormState) {
    return (value: string) => {
      setForm((f) => ({ ...f, [field]: value }));
      // Clear field error on change
      setErrors((e) => ({ ...e, [field]: undefined, global: undefined }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs =
      mode === "login"
        ? validateLoginForm(form)
        : validateRegisterForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await login({ email: form.email, password: form.password });
      } else {
        await register({
          email: form.email,
          password: form.password,
          name: form.name ?? "",
        });
      }
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ global: err.message });
      } else {
        setErrors({
          global: err instanceof Error ? err.message : "Something went wrong",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "1rem",
          padding: "2rem",
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 0.75rem",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-primary-foreground)",
            }}
          >
            S
          </div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              fontFamily: "var(--font-heading)",
              color: "var(--color-foreground)",
              margin: 0,
            }}
          >
            {APP_NAME}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            background: "var(--color-surface-elevated)",
            borderRadius: "0.5rem",
            padding: "3px",
            marginBottom: "1.5rem",
          }}
        >
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErrors({});
              }}
              style={{
                flex: 1,
                padding: "0.375rem",
                borderRadius: "calc(0.5rem - 2px)",
                border: "none",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
                transition: "background 0.15s, color 0.15s",
                background: mode === m ? "var(--color-surface)" : "transparent",
                color:
                  mode === m
                    ? "var(--color-foreground)"
                    : "var(--color-muted)",
              }}
            >
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Global error */}
        {errors.global && (
          <div
            style={{
              background: "oklch(0.63 0.24 25 / 0.1)",
              border: "1px solid var(--color-danger)",
              borderRadius: "0.5rem",
              padding: "0.625rem 0.75rem",
              fontSize: "0.875rem",
              color: "var(--color-danger)",
              marginBottom: "1rem",
            }}
          >
            {errors.global}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {mode === "register" && (
              <FormInput
                label="Full Name"
                id="name"
                value={form.name ?? ""}
                onChange={setField("name")}
                error={errors.name}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
              />
            )}
            <FormInput
              label="Email"
              id="email"
              type="email"
              value={form.email}
              onChange={setField("email")}
              error={errors.email}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <FormInput
              label="Password"
              id="password"
              type="password"
              value={form.password}
              onChange={setField("password")}
              error={errors.password}
              placeholder={mode === "register" ? "At least 8 characters" : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{
                width: "100%",
                justifyContent: "center",
                padding: "0.625rem",
                fontSize: "0.9375rem",
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
            >
              {isSubmitting
                ? mode === "login"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>
          </div>
        </form>

        {/* Footer */}
        {mode === "login" && (
          <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--color-muted)", marginTop: "1.25rem" }}>
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("register")}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-primary)",
                cursor: "pointer",
                fontSize: "inherit",
                padding: 0,
                fontWeight: 500,
              }}
            >
              Sign up
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

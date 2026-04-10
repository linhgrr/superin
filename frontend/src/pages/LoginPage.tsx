/**
 * LoginPage — Refined auth experience.
 *
 * Tabs: Login / Register with refined animations.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/api/axios";
import { APP_NAME } from "@/config";
import { DynamicIcon } from "@/lib/icon-resolver";

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

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({ email: "", password: "", name: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function setField(field: keyof FormState) {
    return (value: string) => {
      setForm((f) => ({ ...f, [field]: value }));
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
    <div className="login-container">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-icon">
            <DynamicIcon name="Sparkles" size={28} />
          </div>
          <h1 className="login-brand-title">{APP_NAME}</h1>
          <p className="login-brand-subtitle">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Tabs */}
        <div className="login-tabs">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErrors({});
              }}
              className={`login-tab ${mode === m ? "login-tab-active" : "login-tab-inactive"}`}
            >
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Global error */}
        {errors.global && (
          <div className="login-global-error animate-fade-in">
            {errors.global}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {mode === "register" && (
              <div className="login-form-group">
                <label className="login-label">Full Name</label>
                <input
                  type="text"
                  value={form.name ?? ""}
                  onChange={(e) => setField("name")(e.target.value)}
                  placeholder="John Doe"
                  autoComplete="name"
                  className="login-input"
                />
                {errors.name && <span className="login-error">{errors.name}</span>}
              </div>
            )}

            <div className="login-form-group">
              <label className="login-label">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField("email")(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="login-input"
              />
              {errors.email && <span className="login-error">{errors.email}</span>}
            </div>

            <div className="login-form-group">
              <label className="login-label">Password</label>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setField("password")(e.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="login-input login-input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <DynamicIcon name="EyeOff" size={18} /> : <DynamicIcon name="Eye" size={18} />}
                </button>
              </div>
              {errors.password && <span className="login-error">{errors.password}</span>}
            </div>

            <button
              type="submit"
              className="btn btn-primary login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="login-submit-loading">
                  <DynamicIcon name="Loader2" size={18} className="animate-spin" />
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
                  {mode === "login" ? "Sign In" : "Create Account"}
                  <DynamicIcon name="ArrowRight" size={18} />
                </span>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        {mode === "login" && (
          <p className="login-footer">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("register")}
              className="login-footer-link"
            >
              Sign up for free
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

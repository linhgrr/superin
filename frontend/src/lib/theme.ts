import { STORAGE_KEYS } from "@/constants";

export type AppTheme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function isTheme(value: unknown): value is AppTheme {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (!raw) return "system";
    const parsed = JSON.parse(raw) as { theme?: unknown };
    return isTheme(parsed.theme) ? parsed.theme : "system";
  } catch {
    return "system";
  }
}

export function persistTheme(theme: AppTheme): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    current.theme = theme;
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(current));
  } catch {
    // Non-critical: keep UI theme in-memory even if persistence fails.
  }
}

export function resolveTheme(theme: AppTheme): ResolvedTheme {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: AppTheme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  return resolved;
}

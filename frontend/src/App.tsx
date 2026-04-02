/**
 * App — top-level router + global providers.
 *
 * Routes:
 *   /          → redirect /dashboard
 *   /login     → LoginPage
 *   /dashboard → DashboardPage (protected)
 *   /store     → StorePage (protected)
 *   /apps/:appId → AppPage (protected)
 */

import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { STORAGE_KEYS, ROUTES } from "@/constants";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppProviders, CommandPalette } from "@/components/providers/AppProviders";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import StorePage from "@/pages/StorePage";
import AppPage from "@/pages/AppPage";
import SettingsPage from "@/pages/SettingsPage";
import AppShell from "@/pages/AppShell";

// ─── Global Theme Loader ───────────────────────────────────────────────────────

function ThemeLoader() {
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        const root = document.documentElement;
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

        if (settings.theme === "dark" || (settings.theme === "system" && systemDark)) {
          root.classList.add("dark");
          root.classList.remove("light");
        } else if (settings.theme === "light") {
          root.classList.add("light");
          root.classList.remove("dark");
        }
        // If theme is "system" and not dark, or light, we keep default (no class)
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  return null;
}

// ─── Protected route wrapper ───────────────────────────────────────────────────

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-background)",
          color: "var(--color-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// ─── Public-only route (redirects if already logged in) ───────────────────────

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function ShellLayout() {
  return (
    <Protected>
      <AppShell />
    </Protected>
  );
}

// ─── Command Palette Wrapper ─────────────────────────────────────────────────

function CommandPaletteWrapper({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleClose = useCallback(() => setIsOpen(false), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      // ? for Keyboard Shortcuts (not in input)
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && target.contentEditable !== "true") {
          e.preventDefault();
          navigate("/settings");
          // Dispatch event to switch to keyboard tab
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("shin:open-settings", { detail: "keyboard" }));
          }, 100);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <>
      {children}
      {isOpen && <CommandPalette onClose={handleClose} />}
    </>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppProviders>
          <ThemeLoader />
          <CommandPaletteWrapper>
            <Routes>
              {/* Public */}
              <Route
                path="/login"
                element={
                  <PublicOnly>
                    <LoginPage />
                  </PublicOnly>
                }
              />

              {/* Protected shell */}
              <Route element={<ShellLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/store" element={<StorePage />} />
                <Route path="/apps/:appId" element={<AppPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/dashboard" />} />

              {/* 404 */}
              <Route
                path="*"
                element={
                  <div
                    style={{
                      minHeight: "100vh",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      background: "var(--color-background)",
                      color: "var(--color-muted)",
                    }}
                  >
                    <span style={{ fontSize: "3rem" }}>404</span>
                    <p>Page not found.</p>
                    <a href="/dashboard" style={{ color: "var(--color-primary)" }}>
                      Go to Dashboard
                    </a>
                  </div>
                }
              />
            </Routes>
          </CommandPaletteWrapper>
        </AppProviders>
      </BrowserRouter>
    </AuthProvider>
  );
}

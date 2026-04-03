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

import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppProviders } from "@/components/providers/AppProviders";
import { DiscoveryInitializer } from "@/components/providers/DiscoveryInitializer";
import { WorkspaceProvider } from "@/components/providers/WorkspaceProvider";
import { STORAGE_KEYS } from "@/constants";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppShell from "@/pages/AppShell";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const StorePage = lazy(() => import("@/pages/StorePage"));
const AppPage = lazy(() => import("@/pages/AppPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const CommandPalette = lazy(async () => {
  const module = await import("@/components/providers/CommandPalette");
  return { default: module.CommandPalette };
});

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
      } catch (error: unknown) {
        console.error("Failed to parse saved theme settings", error);
      }
    }
  }, []);

  return null;
}

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "50vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-muted)",
      }}
    >
      Loading…
    </div>
  );
}

function CommandPaletteFallback() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "oklch(0 0 0 / 0.35)",
      }}
    />
  );
}

function LazyRoute({ Component }: { Component: LazyExoticComponent<ComponentType> }) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Component />
    </Suspense>
  );
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
      <WorkspaceProvider>
        <DiscoveryInitializer>
          <CommandPaletteWrapper>
            <AppShell />
          </CommandPaletteWrapper>
        </DiscoveryInitializer>
      </WorkspaceProvider>
    </Protected>
  );
}

// ─── Command Palette Wrapper ─────────────────────────────────────────────────

function CommandPaletteWrapper({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleClose = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    let cancelScheduled = () => {};
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => {
        void import("@/components/providers/CommandPalette");
      });
      cancelScheduled = () => window.cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(() => {
        void import("@/components/providers/CommandPalette");
      }, 200);
      cancelScheduled = () => window.clearTimeout(handle);
    }

    return () => {
      cancelScheduled();
    };
  }, []);

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
      {isOpen && (
        <Suspense fallback={<CommandPaletteFallback />}>
          <CommandPalette onClose={handleClose} />
        </Suspense>
      )}
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
          <Routes>
            {/* Public */}
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <LazyRoute Component={LoginPage} />
                </PublicOnly>
              }
            />

            {/* Protected shell */}
            <Route element={<ShellLayout />}>
              <Route path="/dashboard" element={<LazyRoute Component={DashboardPage} />} />
              <Route path="/store" element={<LazyRoute Component={StorePage} />} />
              <Route path="/apps/:appId" element={<LazyRoute Component={AppPage} />} />
              <Route path="/settings" element={<LazyRoute Component={SettingsPage} />} />
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
        </AppProviders>
      </BrowserRouter>
    </AuthProvider>
  );
}

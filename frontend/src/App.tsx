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
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { applyTheme, readStoredTheme } from "@/lib/theme";
import AppShell from "@/pages/AppShell";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const StorePage = lazy(() => import("@/pages/StorePage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const BillingSuccessPage = lazy(() => import("@/pages/billing/BillingSuccessPage"));
const BillingCancelPage = lazy(() => import("@/pages/billing/BillingCancelPage"));
const AppPage = lazy(() => import("@/pages/AppPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const CommandPalette = lazy(async () => {
  const module = await import("@/components/providers/command-palette/CommandPalette");
  return { default: module.CommandPalette };
});
const ChatPage = lazy(() => import("@/pages/ChatPage"));

// ─── Global Theme Loader ───────────────────────────────────────────────────────

function ThemeLoader() {
  useEffect(() => {
    const syncTheme = () => applyTheme(readStoredTheme());
    syncTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (readStoredTheme() === "system") {
        syncTheme();
      }
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onSystemThemeChange);
      return () => media.removeEventListener("change", onSystemThemeChange);
    }

    media.addListener(onSystemThemeChange);
    return () => media.removeListener(onSystemThemeChange);
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
        color: "var(--color-foreground-muted)",
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
          color: "var(--color-foreground-muted)",
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
    const handle = window.setTimeout(() => {
      void import("@/components/providers/command-palette/CommandPalette");
    }, 200);
    return () => {
      window.clearTimeout(handle);
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
              <Route path="/billing" element={<LazyRoute Component={BillingPage} />} />
              <Route path="/billing/success" element={<LazyRoute Component={BillingSuccessPage} />} />
              <Route path="/billing/cancel" element={<LazyRoute Component={BillingCancelPage} />} />
              <Route path="/apps/:appId" element={<LazyRoute Component={AppPage} />} />
              <Route path="/settings" element={<LazyRoute Component={SettingsPage} />} />
              <Route path="/admin" element={<LazyRoute Component={AdminPage} />} />
              <Route path="/chat" element={<LazyRoute Component={ChatPage} />} />
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
                    color: "var(--color-foreground-muted)",
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

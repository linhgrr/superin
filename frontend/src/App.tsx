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

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppProviders } from "@/components/providers/AppProviders";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import StorePage from "@/pages/StorePage";
import AppPage from "@/pages/AppPage";
import AppShell from "@/pages/AppShell";

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

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppProviders>
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

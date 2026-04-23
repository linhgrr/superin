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

import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders } from "@/components/providers/AppProviders";
import { DiscoveryInitializer } from "@/components/providers/DiscoveryInitializer";
import { ProtectedShellRuntime } from "@/components/providers/platform/ProtectedShellRuntime";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppShell from "@/pages/shell/AppShell";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const StorePage = lazy(() => import("@/pages/store/StorePage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const BillingSuccessPage = lazy(() => import("@/pages/billing/BillingSuccessPage"));
const BillingCancelPage = lazy(() => import("@/pages/billing/BillingCancelPage"));
const AppPage = lazy(() => import("@/pages/AppPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const ChatPanel = lazy(() => import("@/components/chat/ChatPanel"));

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

function StandardShellLayout() {
  return (
    <Protected>
      <ProtectedShellRuntime />
      <DiscoveryInitializer>
        <AppShell chatPanel={<ChatPanel />} />
      </DiscoveryInitializer>
    </Protected>
  );
}

function ChatShellLayout() {
  return (
    <Protected>
      <ProtectedShellRuntime />
      <DiscoveryInitializer>
        <AppShell title="Chat" />
      </DiscoveryInitializer>
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
                  <LazyRoute Component={LoginPage} />
                </PublicOnly>
              }
            />

            {/* Protected shell */}
            <Route element={<StandardShellLayout />}>
              <Route path="/dashboard" element={<LazyRoute Component={DashboardPage} />} />
              <Route path="/store" element={<LazyRoute Component={StorePage} />} />
              <Route path="/billing" element={<LazyRoute Component={BillingPage} />} />
              <Route path="/billing/success" element={<LazyRoute Component={BillingSuccessPage} />} />
              <Route path="/billing/cancel" element={<LazyRoute Component={BillingCancelPage} />} />
              <Route path="/apps/:appId" element={<LazyRoute Component={AppPage} />} />
              <Route path="/settings" element={<LazyRoute Component={SettingsPage} />} />
              <Route path="/admin" element={<LazyRoute Component={AdminPage} />} />
            </Route>
            <Route element={<ChatShellLayout />}>
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

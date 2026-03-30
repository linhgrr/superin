/**
 * AppPage — /apps/:appId — full app experience page.
 *
 * Renders app-specific layout by delegating to app sub-components.
 * Falls back to a placeholder if the app is not yet implemented.
 */

import { useParams, Navigate } from "react-router-dom";
import AppShell from "./AppShell";
import FinanceAppView from "./apps/FinanceAppView";
import TodoAppView from "./apps/TodoAppView";

const APP_VIEWS: Record<string, React.ComponentType> = {
  finance: FinanceAppView,
  todo: TodoAppView,
};

export default function AppPage() {
  const { appId } = useParams<{ appId: string }>();

  if (!appId) return <Navigate to="/dashboard" replace />;

  const AppView = APP_VIEWS[appId];

  if (!AppView) {
    return (
      <AppShell title={appId}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "50vh",
            gap: "0.5rem",
            color: "var(--color-muted)",
          }}
        >
          <span style={{ fontSize: "2rem" }}>🚧</span>
          <p>
            App <strong>"{appId}"</strong> is not yet implemented.
          </p>
        </div>
      </AppShell>
    );
  }

  return <AppView />;
}

/**
 * AppPage — /apps/:appId — full app experience page.
 *
 * Renders app-specific layout by delegating to app sub-components.
 * Falls back to a placeholder if the app is not yet implemented.
 */

import { useParams, Navigate } from "react-router-dom";
import { Construction } from "lucide-react";
import { getFrontendApp } from "@/apps";

export default function AppPage() {
  const { appId } = useParams<{ appId: string }>();

  if (!appId) return <Navigate to="/dashboard" replace />;

  const appDefinition = getFrontendApp(appId);
  const AppView = appDefinition?.AppView;

  if (!AppView) {
    return (
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
        <Construction size={48} style={{ color: "var(--color-muted)" }} />
        <p>
          App <strong>"{appId}"</strong> is not yet implemented.
        </p>
      </div>
    );
  }

  return <AppView />;
}

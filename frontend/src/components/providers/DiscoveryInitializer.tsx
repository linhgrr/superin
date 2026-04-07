/**
 * DiscoveryInitializer - Component wrapper để lazy load app discovery
 *
 * Chỉ chạy discovery khi component mount (tức là khi user vào protected routes).
 * Không chạy ở login page hoặc public routes.
 */

import { ReactNode, useEffect, useState, memo } from "react";
import { discoverAndRegisterApps } from "@/apps";

interface DiscoveryInitializerProps {
  children: ReactNode;
  fallback?: ReactNode;
}

// Static loading component - không cần recreate
const DefaultLoadingFallback = memo(function DefaultLoadingFallback() {
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            border: "3px solid var(--color-border)",
            borderTopColor: "var(--color-primary)",
            animation: "spin 1s linear infinite",
          }}
        />
        <p style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)" }}>
          Loading apps...
        </p>
      </div>
    </div>
  );
});

export function DiscoveryInitializer({
  children,
  fallback,
}: DiscoveryInitializerProps) {
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    // Chỉ chạy discovery khi component mount
    // Điều này đảm bảo discovery không chạy ở login page
    discoverAndRegisterApps();
    setIsComplete(true);
  }, []);

  if (!isComplete) {
    return fallback || <DefaultLoadingFallback />;
  }

  return <>{children}</>;
}

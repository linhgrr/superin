/**
 * AppProviders — wraps the app with @assistant-ui/react runtime providers.
 *
 * useDataStreamRuntime: manages the SSE chat runtime, auto-sends messages
 * array + receives streaming tokens/tool_calls/tool_results from the backend.
 *
 * MUST be rendered above any component that uses useAssistantRuntime or
 * ThreadPrimitive. Auth protection is handled by the Protected route wrapper.
 */

"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
} from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";

import { getCatalog } from "@/api/catalog";
import { getAccessToken } from "@/api/client";
import { API_BASE_URL } from "@/config";
import { myTools } from "@/lib/assistant-tools";
import type { AppCatalogEntry } from "@/types/generated/api";

interface AppCatalogContextValue {
  catalog: AppCatalogEntry[];
  installedApps: AppCatalogEntry[];
  isCatalogLoading: boolean;
  refreshCatalog: () => Promise<void>;
  setAppInstalled: (appId: string, isInstalled: boolean) => void;
}

const AppCatalogContext = createContext<AppCatalogContextValue | null>(null);

/**
 * Inner component — useDataStreamRuntime must be called inside a React component.
 * The returned runtime is passed to AssistantRuntimeProvider.
 */
function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useDataStreamRuntime({
    api: `${API_BASE_URL}/api/chat/stream`,
    // "data-stream" matches the assistant-stream protocol used by the backend
    protocol: "data-stream",
    body: {
      // tool schemas — assistant-stream's toToolsJSONSchema serializes these
      // for the backend LLM; no execute: needed (server-side execution)
      tools: myTools,
    },
    credentials: "include",
    headers: () => {
      const token = getAccessToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
    onError: (error: Error) => {
      console.error("[ChatRuntime]", error);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

function AppCatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<AppCatalogEntry[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);

  const refreshCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    try {
      setCatalog(await getCatalog());
    } finally {
      setIsCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const setAppInstalled = useCallback((appId: string, isInstalled: boolean) => {
    setCatalog((prev) =>
      prev.map((app) =>
        app.id === appId ? { ...app, is_installed: isInstalled } : app
      )
    );
  }, []);

  const value = useMemo<AppCatalogContextValue>(
    () => ({
      catalog,
      installedApps: catalog.filter((app) => app.is_installed),
      isCatalogLoading,
      refreshCatalog,
      setAppInstalled,
    }),
    [catalog, isCatalogLoading, refreshCatalog, setAppInstalled]
  );

  return (
    <AppCatalogContext.Provider value={value}>
      {children}
    </AppCatalogContext.Provider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppCatalogProvider>
      <ChatRuntimeProvider>{children}</ChatRuntimeProvider>
    </AppCatalogProvider>
  );
}

export function useAppCatalog() {
  const context = useContext(AppCatalogContext);
  if (!context) {
    throw new Error("useAppCatalog must be used within <AppProviders>");
  }
  return context;
}

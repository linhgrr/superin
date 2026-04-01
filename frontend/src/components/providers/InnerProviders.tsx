/**
 * Inner Providers — internal implementation details
 * These are split out to avoid circular dependencies
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
} from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";

import { getCatalog } from "@/api/catalog";
import { getAccessToken } from "@/api/client";
import { API_BASE_URL } from "@/config";
import type { AppCatalogEntry } from "@/types/generated/api";

interface AppCatalogContextValue {
  catalog: AppCatalogEntry[];
  installedApps: AppCatalogEntry[];
  isCatalogLoading: boolean;
  refreshCatalog: () => Promise<void>;
  setAppInstalled: (appId: string, isInstalled: boolean) => void;
}

const AppCatalogContext = createContext<AppCatalogContextValue | null>(null);

function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useDataStreamRuntime({
    api: `${API_BASE_URL}/api/chat/stream`,
    protocol: "data-stream",
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

function useAppCatalog() {
  const context = useContext(AppCatalogContext);
  if (!context) {
    throw new Error("useAppCatalog must be used within <AppCatalogProvider>");
  }
  return context;
}

export { AppCatalogProvider, ChatRuntimeProvider, AppCatalogContext, useAppCatalog };

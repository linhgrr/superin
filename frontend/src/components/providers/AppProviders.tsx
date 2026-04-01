/**
 * AppProviders — wraps the app with all runtime providers
 *
 * Providers hierarchy (outer to inner):
 * 1. ToastProvider — notifications
 * 2. AppCatalogProvider — app registry
 * 3. ChatRuntimeProvider — AI chat
 */

"use client";

import { ReactNode } from "react";
import { AppCatalogProvider, ChatRuntimeProvider, ToastProvider, OnboardingProvider } from "./";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      <ToastProvider>
        <AppCatalogProvider>
          <ChatRuntimeProvider>{children}</ChatRuntimeProvider>
        </AppCatalogProvider>
      </ToastProvider>
    </OnboardingProvider>
  );
}

export { useAppCatalog, useToast, useOnboarding, type Toast, type ToastVariant, type ToastAction } from "./";
export { CommandPalette, type CommandItem } from "./CommandPalette";

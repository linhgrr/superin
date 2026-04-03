/**
 * AppProviders — wraps the app with all runtime providers
 *
 * Providers hierarchy (outer to inner):
 * 1. ToastProvider — notifications
 * 2. Protected-route providers (workspace/chat) are mounted closer to the shell
 */

"use client";

import { ReactNode } from "react";
import { OnboardingProvider } from "./OnboardingProvider";
import { ToastProvider } from "./ToastProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </OnboardingProvider>
  );
}

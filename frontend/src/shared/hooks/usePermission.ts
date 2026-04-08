/**
 * usePermission — client-side permission check mirroring the backend PERMISSIONS matrix.
 *
 * Mirrors `shared/permissions.py` for client-side feature gating.
 * Admin role always passes all permission checks (enforced by the backend).
 *
 * Usage:
 *   const canInstallFinance = usePermission("finance_install");
 *   const canUseRecurring = usePermission("calendar_recurring");
 */

import useSWR from "swr";

import { useAuth } from "@/hooks/useAuth";
import { fetcher } from "@/lib/swr";

// ─── Permission matrix (mirrors backend shared/permissions.py) ─────────────────

const PERMISSIONS: Record<string, Record<"free" | "paid", boolean>> = {
  // App installation
  finance_install: { free: false, paid: true },
  calendar_install: { free: false, paid: true },
  billing_install: { free: true, paid: true },
  todo_install: { free: true, paid: true },
  chat_install: { free: true, paid: true },
  health2_install: { free: true, paid: true },
  // Feature-level per app
  calendar_recurring: { free: false, paid: true },
  calendar_export: { free: false, paid: true },
  todo_recurring: { free: false, paid: true },
  finance_wallet_multiple: { free: false, paid: true },
  finance_export: { free: false, paid: true },
  chat_ai_unlimited: { free: false, paid: true },
  // Admin (frontend does not gate on admin permissions — they are backend-only)
  admin_users_view: { free: false, paid: false },
  admin_subscriptions_view: { free: false, paid: false },
  admin_apps_manage: { free: false, paid: false },
};

function hasPermission(tier: "free" | "paid", permission: string): boolean {
  return PERMISSIONS[permission]?.[tier] ?? false;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

interface SubscriptionResponse {
  tier: "free" | "paid";
}

/**
 * Returns `true` if the current user has the named permission.
 *
 * Missing permission key = denied (safe default).
 * Admin role bypass is handled server-side; the hook only checks tier.
 */
export function usePermission(permission: string): boolean {
  const { user, isAuthenticated } = useAuth();
  const shouldFetchSubscription = isAuthenticated && user?.role !== "admin";

  const { data } = useSWR<SubscriptionResponse>(
    shouldFetchSubscription ? "/api/billing/subscription" : null,
    fetcher,
    {
      revalidateOnMount: false,
    },
  );

  // Admin always passes (backend also enforces this)
  if (user?.role === "admin") return true;
  if (!isAuthenticated) return false;

  const tier = data?.tier ?? "free";
  return hasPermission(tier, permission);
}

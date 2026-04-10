/**
 * usePermission — client-side permission check backed by /api/auth/permissions.
 *
 * Source of truth is backend `shared/permissions.py`.
 * Frontend does not redefine permission matrix.
 *
 * Usage:
 *   const canUseUnlimitedAI = usePermission(PERMISSION_KEYS.CHAT_AI_UNLIMITED);
 */

import useSWR from "swr";

import { getMyPermissions } from "@/api/auth";
import { useAuth } from "@/hooks/useAuth";
import { PermissionKey, UserRole } from "@/types/generated";
import type {
  PermissionKey as PermissionKeyValue,
  PermissionListRead,
} from "@/types/generated";

const SWR_PERMISSION_KEY = "auth:permissions";

export const PERMISSION_KEYS = PermissionKey;

function hasPermission(snapshot: PermissionListRead | undefined, permission: PermissionKeyValue): boolean {
  if (!snapshot) return false;

  const item = snapshot.items.find((entry) => entry.key === permission);
  return item?.allowed ?? false;
}

/**
 * Returns `true` if the current user has the named permission.
 *
 * Missing permission key = denied (safe default).
 */
export function usePermission(permission: PermissionKeyValue): boolean {
  const { user, isAuthenticated } = useAuth();

  const { data } = useSWR<PermissionListRead>(
    isAuthenticated ? SWR_PERMISSION_KEY : null,
    getMyPermissions,
    {
      revalidateOnMount: false,
    },
  );

  if (!isAuthenticated) return false;
  if (user?.role === UserRole.ADMIN) return true;

  return hasPermission(data, permission);
}

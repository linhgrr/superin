/**
 * API Routes - Core platform only.
 *
 * Generated routes live in `api.generated.ts` (source: backend OpenAPI via codegen).
 */

export { AUTH_ROUTES, API_PATHS } from "./api.generated";

// ─── App API Helper ───────────────────────────────────────────────────────────
/**
 * Build base path for an app API.
 *
 * Used by generated app-local `api.ts` facades:
 *   const BASE = appApiBase("finance"); // → "/api/apps/finance"
 */
export const appApiBase = (appId: string): string => `/api/apps/${appId}`;

/**
 * Auth Event Bus — Pub/Sub for auth state changes
 *
 * This avoids circular dependencies between useAuth and AppCatalogProvider
 */

export type AuthStateListener = (isAuthenticated: boolean) => void;

const listeners: Set<AuthStateListener> = new Set();

export function subscribeToAuthState(listener: AuthStateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyAuthStateChanged(isAuthenticated: boolean): void {
  listeners.forEach((cb) => cb(isAuthenticated));
}

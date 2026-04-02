/**
 * useAuth — global auth state via React context.
 *
 * Provides:
 *   user, isLoading, isAuthenticated, login, register, logout
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister } from "@/api/auth";
import { isAuthenticated, triggerLogout } from "@/api/axios";
import { notifyAuthStateChanged } from "@/lib/auth-events";
import type { LoginRequest, RegisterRequest, UserPublic } from "@/types/generated/api";

interface AuthContextValue {
  user: UserPublic | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!isAuthenticated()) {
      setIsLoading(false);
      return;
    }

    getMe()
      .then((u) => setUser(u))
      .catch(() => {
        // Auth failed - logout and redirect (handled by triggerLogout)
        triggerLogout();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (payload: LoginRequest) => {
    const res = await apiLogin(payload);
    // apiLogin already calls setAccessToken
    setUser(res.user);
    // Notify catalog provider to refresh
    notifyAuthStateChanged(true);
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    const res = await apiRegister(payload);
    // apiRegister already calls setAccessToken
    setUser(res.user);
    // Notify catalog provider to refresh
    notifyAuthStateChanged(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      triggerLogout();
      setUser(null);
      notifyAuthStateChanged(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, isAuthenticated: user !== null, login, register, logout }),
    [user, isLoading, login, logout, register]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

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
import { UserRole } from "@/types/generated";
import type { LoginRequest, RegisterRequest, UserPublic } from "@/types/generated";

interface AuthContextValue {
  user: UserPublic | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<UserPublic | null>;
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
      .catch((error: unknown) => {
        console.error("Failed to restore authenticated user session", error);
        triggerLogout();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (payload: LoginRequest) => {
    const res = await apiLogin(payload);
    // apiLogin already calls setAccessToken
    setUser(res.user);
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    const res = await apiRegister(payload);
    // apiRegister already calls setAccessToken
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      triggerLogout();
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<UserPublic | null> => {
    if (!isAuthenticated()) {
      setUser(null);
      return null;
    }
    const nextUser = await getMe();
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      isAdmin: user?.role === UserRole.ADMIN,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, logout, refreshUser, register]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * Auth API — login, register, logout, token refresh, current user.
 */

import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UserPublic,
} from "@/types/generated/api";
import { api, setAccessToken, clearAccessToken } from "./client";

// POST /api/auth/login
export async function login(payload: LoginRequest): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/api/auth/login", payload);
  setAccessToken(res.access_token);
  return res;
}

// POST /api/auth/register
export async function register(
  payload: RegisterRequest
): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/api/auth/register", payload);
  setAccessToken(res.access_token);
  return res;
}

// POST /api/auth/logout
export async function logout(): Promise<void> {
  try {
    await api.post<void>("/api/auth/logout");
  } finally {
    clearAccessToken();
  }
}

// GET /api/auth/me
export async function getMe(): Promise<UserPublic> {
  return api.get<UserPublic>("/api/auth/me");
}

// Re-export types for convenience
export type { LoginRequest, RegisterRequest, TokenResponse, UserPublic };

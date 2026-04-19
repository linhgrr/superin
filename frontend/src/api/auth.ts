/**
 * Auth API — login, register, logout, current user.
 *
 * Uses axios client with automatic token handling.
 */

import type {
  LoginRequest,
  PermissionListRead,
  RegisterRequest,
  TokenResponse,
  UpdateUserSettingsRequest,
  UserPublic,
} from "@/types/generated";
import { API_PATHS } from "@/constants/api";
import { clearAccessToken, setAccessToken } from "./auth-session";
import { api } from "./axios";

// POST /api/auth/login
export async function login(payload: LoginRequest): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>(API_PATHS.LOGIN, payload);
  setAccessToken(res.access_token);
  return res;
}

// POST /api/auth/register
export async function register(
  payload: RegisterRequest
): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>(API_PATHS.REGISTER, payload);
  setAccessToken(res.access_token);
  return res;
}

// POST /api/auth/logout
export async function logout(): Promise<void> {
  try {
    await api.post<void>(API_PATHS.LOGOUT);
  } finally {
    clearAccessToken();
  }
}

// GET /api/auth/me
export async function getMe(): Promise<UserPublic> {
  return api.get<UserPublic>(API_PATHS.ME);
}

// GET /api/auth/permissions
export async function getMyPermissions(): Promise<PermissionListRead> {
  return api.get<PermissionListRead>(API_PATHS.PERMISSIONS);
}

// PATCH /api/auth/me/settings
export async function updateUserSettings(
  payload: UpdateUserSettingsRequest
): Promise<UserPublic> {
  return api.patch<UserPublic>(API_PATHS.SETTINGS, payload);
}

// POST /api/auth/me/avatar (multipart/form-data)
export async function uploadProfileAvatar(file: File): Promise<UserPublic> {
  const formData = new FormData();
  formData.append("file", file);
  return api.post<UserPublic>(API_PATHS.ME_AVATAR, formData);
}

// Re-export types for convenience
export type { LoginRequest, RegisterRequest, TokenResponse, UserPublic };

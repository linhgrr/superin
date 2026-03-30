/**
 * App API — app-specific CRUD routed through the plugin's routes.
 * All app routes are mounted under /api/apps/{appId}/...
 */
import { apiFetch } from "./client";

/**
 * Make a typed request to an app-specific route.
 * The caller specifies the appId + path, method, and body.
 */
export async function appRequest<T = unknown>(
  appId: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return apiFetch<T>(`/api/apps/${appId}${path}`, init);
}

// ─── Finance ──────────────────────────────────────────────────────────────────

export interface WalletSummary {
  id: string;
  name: string;
  currency: string;
  balance: number;
}

export interface TransactionSummary {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  wallet_id: string;
  date: string;
  note?: string;
}

export interface FinanceOverview {
  total_balance: number;
  total_income: number;
  total_expense: number;
  wallets: WalletSummary[];
}

export async function getFinanceOverview(): Promise<FinanceOverview> {
  return appRequest<FinanceOverview>("finance", "/overview");
}

export async function getTransactions(
  walletId?: string,
  limit = 20
): Promise<TransactionSummary[]> {
  const params = walletId ? `?wallet_id=${walletId}&limit=${limit}` : `?limit=${limit}`;
  return appRequest<TransactionSummary[]>("finance", `/transactions${params}`);
}

// ─── Todo ─────────────────────────────────────────────────────────────────────

export interface TodoSummary {
  id: string;
  title: string;
  status: "pending" | "completed";
  priority: "low" | "medium" | "high";
  due_date?: string;
}

export interface TodoOverview {
  pending: number;
  completed: number;
  overdue: number;
}

export async function getTodoOverview(): Promise<TodoOverview> {
  return appRequest<TodoOverview>("todo", "/overview");
}

export async function getTasks(filters?: {
  status?: string;
  priority?: string;
  limit?: number;
}): Promise<TodoSummary[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return appRequest<TodoSummary[]>("todo", `/tasks${qs ? "?" + qs : ""}`);
}
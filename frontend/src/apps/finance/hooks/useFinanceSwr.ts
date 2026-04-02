/**
 * Finance App SWR Hooks
 *
 * Plug-n-play: Self-contained, only imports from shared lib and own app.
 */

import useSWR from "swr";
import { swrConfig, fetcher, mutateByPrefix } from "@/lib/swr";
import type {
  FinanceSummary,
  CreateWalletRequest,
  CreateCategoryRequest,
  CreateTransactionRequest,
  TransferRequest,
} from "@/types/generated/api";

const BASE = "/api/apps/finance";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WalletRead {
  id: string;
  name: string;
  currency: string;
  balance: number;
  created_at: string;
}

export interface TransactionRead {
  id: string;
  wallet_id: string;
  category_id: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  note: string | null;
  category?: { name: string; icon: string; color: string };
}

export interface CategoryRead {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  budget: number;
  created_at: string;
}

export interface BudgetStatus {
  category_id: string;
  name: string;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
  is_over: boolean;
}

export interface BudgetCheckResponse {
  categories: BudgetStatus[];
  total_budget: number;
  total_spent: number;
}

export interface CategoryBreakdownItem {
  category_id: string;
  name: string;
  color: string;
  amount: number;
  percentage: number;
  transaction_count: number;
}

export interface CategoryBreakdownResponse {
  categories: CategoryBreakdownItem[];
  total: number;
  month: number;
  year: number;
}

export interface MonthlyTrendItem {
  month: string;
  month_num: number;
  year: number;
  income: number;
  expense: number;
  net: number;
}

export interface MonthlyTrendResponse {
  months: MonthlyTrendItem[];
}

export interface TransferResponse {
  from_wallet: WalletRead;
  to_wallet: WalletRead;
  amount: number;
  note: string | null;
}

// ─── Read Hooks ──────────────────────────────────────────────────────────────

export function useFinanceSummary() {
  return useSWR<FinanceSummary>(
    "finance/summary",
    () => fetcher(`${BASE}/summary`),
    { ...swrConfig, refreshInterval: 30000 }
  );
}

export function useWallets() {
  return useSWR<WalletRead[]>("finance/wallets", () => fetcher(`${BASE}/wallets`), swrConfig);
}

export function useCategories() {
  return useSWR<CategoryRead[]>("finance/categories", () => fetcher(`${BASE}/categories`), swrConfig);
}

export function useTransactions(params?: { wallet_id?: string; type?: "income" | "expense"; limit?: number }) {
  const key = params ? ["finance/transactions", params] : "finance/transactions";
  return useSWR<TransactionRead[]>(
    key,
    () => {
      const qs = new URLSearchParams();
      if (params?.wallet_id) qs.set("wallet_id", params.wallet_id);
      if (params?.type) qs.set("type", params.type);
      if (params?.limit) qs.set("limit", String(params.limit));
      const query = qs.toString();
      return fetcher(`${BASE}/transactions${query ? `?${query}` : ""}`);
    },
    swrConfig
  );
}

export function useMonthlyTrend(months = 6) {
  return useSWR<MonthlyTrendResponse>(
    ["finance/analytics/monthly-trend", months],
    () => fetcher(`${BASE}/analytics/monthly-trend?months=${months}`),
    { ...swrConfig, revalidateOnFocus: false }
  );
}

export function useCategoryBreakdown(month?: number, year?: number) {
  const key = month && year ? ["finance/analytics/category-breakdown", month, year] : "finance/analytics/category-breakdown";
  return useSWR<CategoryBreakdownResponse>(
    key,
    () => {
      const qs = new URLSearchParams();
      if (month) qs.set("month", String(month));
      if (year) qs.set("year", String(year));
      const query = qs.toString();
      return fetcher(`${BASE}/analytics/category-breakdown${query ? `?${query}` : ""}`);
    },
    { ...swrConfig, revalidateOnFocus: false }
  );
}

export function useBudgetCheck(categoryId?: string) {
  return useSWR<BudgetCheckResponse>(
    categoryId ? ["finance/budget/check", categoryId] : "finance/budget/check",
    () => {
      const qs = new URLSearchParams();
      if (categoryId) qs.set("category_id", categoryId);
      const query = qs.toString();
      return fetcher(`${BASE}/budget/check${query ? `?${query}` : ""}`);
    },
    swrConfig
  );
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const { api } = await import("@/api/client");
  return api.post<T>(path, body);
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const { api } = await import("@/api/client");
  return api.patch<T>(path, body);
}

async function del(path: string): Promise<void> {
  const { api } = await import("@/api/client");
  return api.delete<void>(path);
}

export async function createWallet(payload: CreateWalletRequest): Promise<WalletRead> {
  const result = await post<WalletRead>(`${BASE}/wallets`, payload);
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
  return result;
}

export async function updateWallet(id: string, name: string): Promise<WalletRead> {
  const result = await patch<WalletRead>(`${BASE}/wallets/${id}`, { name });
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
  return result;
}

export async function deleteWallet(id: string): Promise<void> {
  await del(`${BASE}/wallets/${id}`);
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
}

export async function createCategory(payload: CreateCategoryRequest): Promise<CategoryRead> {
  const result = await post<CategoryRead>(`${BASE}/categories`, payload);
  mutateByPrefix("finance/categories");
  return result;
}

export async function updateCategory(id: string, payload: CreateCategoryRequest): Promise<CategoryRead> {
  const result = await patch<CategoryRead>(`${BASE}/categories/${id}`, payload);
  mutateByPrefix("finance/categories");
  return result;
}

export async function deleteCategory(id: string): Promise<void> {
  await del(`${BASE}/categories/${id}`);
  mutateByPrefix("finance/categories");
}

export async function createTransaction(payload: CreateTransactionRequest): Promise<TransactionRead> {
  const result = await post<TransactionRead>(`${BASE}/transactions`, payload);
  mutateByPrefix("finance/transactions");
  mutateByPrefix("finance/summary");
  return result;
}

export async function updateTransaction(id: string, payload: CreateTransactionRequest): Promise<TransactionRead> {
  const result = await patch<TransactionRead>(`${BASE}/transactions/${id}`, payload);
  mutateByPrefix("finance/transactions");
  mutateByPrefix("finance/summary");
  return result;
}

export async function deleteTransaction(id: string): Promise<void> {
  await del(`${BASE}/transactions/${id}`);
  mutateByPrefix("finance/transactions");
  mutateByPrefix("finance/summary");
}

export async function transfer(payload: TransferRequest): Promise<TransferResponse> {
  const result = await post<TransferResponse>(`${BASE}/transfer`, payload);
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
  mutateByPrefix("finance/transactions");
  return result;
}

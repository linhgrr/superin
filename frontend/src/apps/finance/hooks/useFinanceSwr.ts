/**
 * Finance App SWR Hooks
 *
 * Plug-n-play: Self-contained, only imports from shared lib and own app.
 */

import useSWR from "swr";
import { swrConfig, mutateByPrefix } from "@/lib/swr";
import {
  checkBudget as apiCheckBudget,
  createCategory as apiCreateCategory,
  createTransaction as apiCreateTransaction,
  createWallet as apiCreateWallet,
  deleteCategory as apiDeleteCategory,
  deleteTransaction as apiDeleteTransaction,
  deleteWallet as apiDeleteWallet,
  getCategories as apiGetCategories,
  getCategoryBreakdown as apiGetCategoryBreakdown,
  getFinanceSummary as apiGetFinanceSummary,
  getMonthlyTrend as apiGetMonthlyTrend,
  getTransactions as apiGetTransactions,
  getWallets as apiGetWallets,
  transfer as apiTransfer,
  updateCategory as apiUpdateCategory,
  updateTransaction as apiUpdateTransaction,
  updateWallet as apiUpdateWallet,
} from "../api";
import type {
  CheckBudgetResponse,
  CategoryBreakdownResponse,
  CategoryRead,
  CreateCategoryRequest,
  CreateTransactionRequest,
  CreateWalletRequest,
  MonthlyTrendResponse,
  SummaryResponse,
  TransactionRead,
  TransferRequest,
  TransferResponse,
  UpdateCategoryRequest,
  UpdateTransactionRequest,
  UpdateWalletRequest,
  WalletRead,
} from "../api";

// ─── Read Hooks ──────────────────────────────────────────────────────────────

export function useFinanceSummary() {
  return useSWR<SummaryResponse>(
    "finance/summary",
    apiGetFinanceSummary,
    { ...swrConfig, refreshInterval: 30000 }
  );
}

export function useWallets() {
  return useSWR<WalletRead[]>("finance/wallets", apiGetWallets, swrConfig);
}

export function useCategories() {
  return useSWR<CategoryRead[]>("finance/categories", apiGetCategories, swrConfig);
}

export function useTransactions(params?: { wallet_id?: string; type?: "income" | "expense"; limit?: number }) {
  const key = params ? ["finance/transactions", params] : "finance/transactions";
  return useSWR<TransactionRead[]>(
    key,
    () => apiGetTransactions(params),
    swrConfig
  );
}

export function useMonthlyTrend(months = 6) {
  return useSWR<MonthlyTrendResponse>(
    ["finance/analytics/monthly-trend", months],
    () => apiGetMonthlyTrend({ months }),
    { ...swrConfig, revalidateOnFocus: false }
  );
}

export function useCategoryBreakdown(month?: number, year?: number) {
  const key = month && year ? ["finance/analytics/category-breakdown", month, year] : "finance/analytics/category-breakdown";
  return useSWR<CategoryBreakdownResponse>(
    key,
    () => apiGetCategoryBreakdown({ month, year }),
    { ...swrConfig, revalidateOnFocus: false }
  );
}

export function useBudgetCheck(categoryId?: string) {
  return useSWR<CheckBudgetResponse>(
    categoryId ? ["finance/budget/check", categoryId] : "finance/budget/check",
    () => apiCheckBudget(categoryId ? { category_id: categoryId } : {}),
    swrConfig
  );
}

export async function createWallet(payload: CreateWalletRequest): Promise<WalletRead> {
  const result = await apiCreateWallet(payload);
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
  return result;
}

export async function updateWallet(id: string, payload: UpdateWalletRequest): Promise<WalletRead> {
  const result = await apiUpdateWallet(id, payload);
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
  return result;
}

export async function deleteWallet(id: string): Promise<void> {
  await apiDeleteWallet(id);
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
}

export async function createCategory(payload: CreateCategoryRequest): Promise<CategoryRead> {
  const result = await apiCreateCategory(payload);
  mutateByPrefix("finance/categories");
  return result;
}

export async function updateCategory(id: string, payload: UpdateCategoryRequest): Promise<CategoryRead> {
  const result = await apiUpdateCategory(id, payload);
  mutateByPrefix("finance/categories");
  return result;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiDeleteCategory(id);
  mutateByPrefix("finance/categories");
}

export async function createTransaction(payload: CreateTransactionRequest): Promise<TransactionRead> {
  const result = await apiCreateTransaction(payload);
  mutateByPrefix("finance/transactions");
  mutateByPrefix("finance/summary");
  return result;
}

export async function updateTransaction(id: string, payload: UpdateTransactionRequest): Promise<TransactionRead> {
  const result = await apiUpdateTransaction(id, payload);
  mutateByPrefix("finance/transactions");
  mutateByPrefix("finance/summary");
  return result;
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiDeleteTransaction(id);
  mutateByPrefix("finance/transactions");
  mutateByPrefix("finance/summary");
}

export async function transfer(payload: TransferRequest): Promise<TransferResponse> {
  const result = await apiTransfer(payload);
  mutateByPrefix("finance/wallets");
  mutateByPrefix("finance/summary");
  mutateByPrefix("finance/transactions");
  return result;
}

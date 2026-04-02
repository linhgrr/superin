/**
 * Finance App API — wallets, transactions, categories.
 *
 * Plug-n-play: Self-contained, no dependency on global app-specific constants.
 */

import type {
  CreateWalletRequest,
  CreateCategoryRequest,
  CreateTransactionRequest,
  TransferRequest,
} from "@/types/generated/api";
import { api } from "@/api/client";

const BASE = "/api/apps/finance";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Wallets ────────────────────────────────────────────────────────────────────

export async function getWallets(): Promise<WalletRead[]> {
  return api.get<WalletRead[]>(`${BASE}/wallets`);
}

export async function getWallet(id: string): Promise<WalletRead> {
  return api.get<WalletRead>(`${BASE}/wallets/${id}`);
}

export async function createWallet(payload: CreateWalletRequest): Promise<WalletRead> {
  return api.post<WalletRead>(`${BASE}/wallets`, payload);
}

export async function updateWallet(id: string, name: string): Promise<WalletRead> {
  return api.patch<WalletRead>(`${BASE}/wallets/${id}`, { name });
}

export async function deleteWallet(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/wallets/${id}`);
}

// ─── Categories ─────────────────────────────────────────────────────────────────

export async function getCategories(): Promise<CategoryRead[]> {
  return api.get<CategoryRead[]>(`${BASE}/categories`);
}

export async function getCategory(id: string): Promise<CategoryRead> {
  return api.get<CategoryRead>(`${BASE}/categories/${id}`);
}

export async function createCategory(payload: CreateCategoryRequest): Promise<CategoryRead> {
  return api.post<CategoryRead>(`${BASE}/categories`, payload);
}

export async function updateCategory(
  id: string,
  payload: CreateCategoryRequest
): Promise<CategoryRead> {
  return api.patch<CategoryRead>(`${BASE}/categories/${id}`, payload);
}

export async function deleteCategory(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/categories/${id}`);
}

// ─── Transactions ───────────────────────────────────────────────────────────────

export async function getTransactions(params?: {
  wallet_id?: string;
  type?: "income" | "expense";
  limit?: number;
}): Promise<TransactionRead[]> {
  const qs = new URLSearchParams();
  if (params?.wallet_id) qs.set("wallet_id", params.wallet_id);
  if (params?.type) qs.set("type", params.type);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return api.get<TransactionRead[]>(`${BASE}/transactions${query ? `?${query}` : ""}`);
}

export async function createTransaction(payload: CreateTransactionRequest): Promise<TransactionRead> {
  return api.post<TransactionRead>(`${BASE}/transactions`, payload);
}

export async function updateTransaction(
  id: string,
  payload: CreateTransactionRequest
): Promise<TransactionRead> {
  return api.patch<TransactionRead>(`${BASE}/transactions/${id}`, payload);
}

export async function deleteTransaction(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/transactions/${id}`);
}

export async function searchTransactions(params?: {
  query?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
}): Promise<TransactionRead[]> {
  const qs = new URLSearchParams();
  if (params?.query) qs.set("query", params.query);
  if (params?.start_date) qs.set("start_date", params.start_date);
  if (params?.end_date) qs.set("end_date", params.end_date);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return api.get<TransactionRead[]>(`${BASE}/transactions/search${query ? `?${query}` : ""}`);
}

// ─── Budget & Analytics ─────────────────────────────────────────────────────────

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

export async function checkBudget(categoryId?: string): Promise<BudgetCheckResponse> {
  const qs = new URLSearchParams();
  if (categoryId) qs.set("category_id", categoryId);
  const query = qs.toString();
  return api.get<BudgetCheckResponse>(`${BASE}/budget/check${query ? `?${query}` : ""}`);
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

export async function getCategoryBreakdown(month?: number, year?: number): Promise<CategoryBreakdownResponse> {
  const qs = new URLSearchParams();
  if (month) qs.set("month", String(month));
  if (year) qs.set("year", String(year));
  const query = qs.toString();
  return api.get<CategoryBreakdownResponse>(`${BASE}/analytics/category-breakdown${query ? `?${query}` : ""}`);
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

export async function getMonthlyTrend(months = 6): Promise<MonthlyTrendResponse> {
  const qs = new URLSearchParams();
  qs.set("months", String(months));
  return api.get<MonthlyTrendResponse>(`${BASE}/analytics/monthly-trend?${qs.toString()}`);
}

// ─── Transfer & Summary ─────────────────────────────────────────────────────────

export interface TransferResponse {
  from_wallet: WalletRead;
  to_wallet: WalletRead;
  amount: number;
  note: string | null;
}

export async function transfer(payload: TransferRequest): Promise<TransferResponse> {
  return api.post<TransferResponse>(`${BASE}/transfer`, payload);
}

export interface FinanceSummary {
  total_balance: number;
  income_this_month: number;
  expense_this_month: number;
  transaction_count: number;
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  return api.get<FinanceSummary>(`${BASE}/summary`);
}

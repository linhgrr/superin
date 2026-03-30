/**
 * Finance App API — wallets, transactions, categories.
 */

import type {
  CreateWalletRequest,
  CreateCategoryRequest,
  CreateTransactionRequest,
  TransferRequest,
} from "@/types/generated/api";
import { api, appPath } from "../client";

const BASE = "/api/apps/finance";

// Wallets
export interface WalletRead {
  id: string;
  user_id: string;
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

// GET /api/apps/finance/wallets
export async function getWallets(): Promise<WalletRead[]> {
  return api.get<WalletRead[]>(`${BASE}/wallets`);
}

// POST /api/apps/finance/wallets
export async function createWallet(
  payload: CreateWalletRequest
): Promise<WalletRead> {
  return api.post<WalletRead>(`${BASE}/wallets`, payload);
}

// DELETE /api/apps/finance/wallets/{id}
export async function deleteWallet(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/wallets/${id}`);
}

// GET /api/apps/finance/categories
export async function getCategories(): Promise<CategoryRead[]> {
  return api.get<CategoryRead[]>(`${BASE}/categories`);
}

// POST /api/apps/finance/categories
export async function createCategory(
  payload: CreateCategoryRequest
): Promise<CategoryRead> {
  return api.post<CategoryRead>(`${BASE}/categories`, payload);
}

// GET /api/apps/finance/transactions
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
  return api.get<TransactionRead[]>(
    `${BASE}/transactions${query ? `?${query}` : ""}`
  );
}

// POST /api/apps/finance/transactions
export async function createTransaction(
  payload: CreateTransactionRequest
): Promise<TransactionRead> {
  return api.post<TransactionRead>(`${BASE}/transactions`, payload);
}

// POST /api/apps/finance/transfer
export async function transfer(payload: TransferRequest): Promise<void> {
  return api.post<void>(`${BASE}/transfer`, payload);
}

// GET /api/apps/finance/summary — quick stats for dashboard widgets
export interface FinanceSummary {
  total_balance: number;
  income_this_month: number;
  expense_this_month: number;
  transaction_count: number;
}
export async function getFinanceSummary(): Promise<FinanceSummary> {
  return api.get<FinanceSummary>(`${BASE}/summary`);
}

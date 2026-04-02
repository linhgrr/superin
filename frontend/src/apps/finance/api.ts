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

export async function createWallet(payload: CreateWalletRequest): Promise<WalletRead> {
  return api.post<WalletRead>(`${BASE}/wallets`, payload);
}

export async function deleteWallet(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/wallets/${id}`);
}

// ─── Categories ─────────────────────────────────────────────────────────────────

export async function getCategories(): Promise<CategoryRead[]> {
  return api.get<CategoryRead[]>(`${BASE}/categories`);
}

export async function createCategory(payload: CreateCategoryRequest): Promise<CategoryRead> {
  return api.post<CategoryRead>(`${BASE}/categories`, payload);
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

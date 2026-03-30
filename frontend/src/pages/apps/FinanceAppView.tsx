/**
 * FinanceAppView — /apps/finance — full finance dashboard.
 *
 * Tabs: Wallets | Transactions | Categories
 */

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import {
  getWallets,
  getCategories,
  getTransactions,
  createWallet,
  createTransaction,
  createCategory,
  type WalletRead,
  type CategoryRead,
  type TransactionRead,
} from "@/api/apps/finance";
import type {
  CreateWalletRequest,
  CreateCategoryRequest,
  CreateTransactionRequest,
} from "@/types/generated/api";

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "0.25rem" }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SimpleForm({
  fields,
  submitLabel,
  onSubmit,
}: {
  fields: { label: string; key: string; type?: string; placeholder?: string }[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {fields.map((f) => (
        <div key={f.key}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-muted)",
            }}
          >
            {f.label}
          </label>
          <input
            type={f.type ?? "text"}
            placeholder={f.placeholder}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            required
          />
        </div>
      ))}
      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: "0.875rem", margin: 0 }}>{error}</p>
      )}
      <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: "center" }}>
        {loading ? "…" : submitLabel}
      </button>
    </form>
  );
}

// ─── Wallets Tab ──────────────────────────────────────────────────────────────

function WalletsTab() {
  const [wallets, setWallets] = useState<WalletRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getWallets()
      .then(setWallets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const total = wallets.reduce((sum, w) => sum + w.balance, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <p className="section-label">Total Balance</p>
          <div className="stat-value">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total)}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Wallet
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--color-muted)" }}>Loading…</p>
      ) : wallets.length === 0 ? (
        <p style={{ color: "var(--color-muted)" }}>No wallets yet. Create one to get started.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {wallets.map((w) => (
            <div
              key={w.id}
              style={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.75rem",
                padding: "1rem",
              }}
            >
              <p style={{ fontWeight: 600, margin: "0 0 0.25rem" }}>{w.name}</p>
              <p
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  fontFamily: "var(--font-heading)",
                  margin: 0,
                  color: w.balance >= 0 ? "var(--color-success)" : "var(--color-danger)",
                }}
              >
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: w.currency,
                  minimumFractionDigits: 0,
                }).format(w.balance)}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
                {w.currency}
              </p>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="New Wallet" onClose={() => setShowModal(false)}>
          <SimpleForm
            fields={[
              { label: "Wallet Name", key: "name", placeholder: "e.g. Main Account" },
              { label: "Currency", key: "currency", placeholder: "USD" },
            ]}
            submitLabel="Create Wallet"
            onSubmit={async (vals) => {
              const req: CreateWalletRequest = {
                name: vals.name,
                currency: vals.currency || "USD",
              };
              await createWallet(req);
              setShowModal(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Transactions Tab ──────────────────────────────────────────────────────────

function TransactionsTab() {
  const [txns, setTxns] = useState<TransactionRead[]>([]);
  const [wallets, setWallets] = useState<WalletRead[]>([]);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    Promise.all([getTransactions({ limit: 50 }), getWallets(), getCategories()])
      .then(([txns, wallets, cats]) => {
        setTxns(txns);
        setWallets(wallets);
        setCategories(cats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Transaction
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--color-muted)" }}>Loading…</p>
      ) : txns.length === 0 ? (
        <p style={{ color: "var(--color-muted)" }}>No transactions yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(t.date).toLocaleDateString()}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: "0.125rem 0.5rem",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        background:
                          t.type === "income"
                            ? "oklch(0.72 0.19 145 / 0.15)"
                            : "oklch(0.63 0.24 25 / 0.15)",
                        color:
                          t.type === "income"
                            ? "var(--color-success)"
                            : "var(--color-danger)",
                      }}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td>{t.category?.name ?? "—"}</td>
                  <td
                    className={t.type === "income" ? "amount-positive" : "amount-negative"}
                    style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(t.amount)}
                  </td>
                  <td style={{ color: "var(--color-muted)", maxWidth: "200px" }}>
                    {t.note ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="New Transaction" onClose={() => setShowModal(false)}>
          <SimpleForm
            fields={[
              { label: "Wallet ID", key: "wallet_id", placeholder: "Wallet ID" },
              { label: "Category ID", key: "category_id", placeholder: "Category ID" },
              { label: "Type", key: "type", placeholder: "income or expense" },
              { label: "Amount", key: "amount", type: "number", placeholder: "0.00" },
              { label: "Date (ISO)", key: "date", placeholder: new Date().toISOString() },
              { label: "Note (optional)", key: "note", placeholder: "Lunch at restaurant" },
            ]}
            submitLabel="Add Transaction"
            onSubmit={async (vals) => {
              const req: CreateTransactionRequest = {
                wallet_id: vals.wallet_id,
                category_id: vals.category_id,
                type: vals.type as "income" | "expense",
                amount: parseFloat(vals.amount),
                date: new Date(vals.date),
                note: vals.note || undefined,
              };
              await createTransaction(req);
              setShowModal(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab() {
  const [cats, setCats] = useState<CategoryRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getCategories()
      .then(setCats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Category
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--color-muted)" }}>Loading…</p>
      ) : cats.length === 0 ? (
        <p style={{ color: "var(--color-muted)" }}>No categories yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {cats.map((c) => (
            <div
              key={c.id}
              style={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.75rem",
                padding: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: c.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.875rem",
                  flexShrink: 0,
                }}
              >
                {c.icon ? c.icon.slice(0, 1) : c.name.slice(0, 1)}
              </div>
              <div>
                <p style={{ fontWeight: 500, margin: 0, fontSize: "0.875rem" }}>{c.name}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", margin: 0 }}>
                  Budget: ${c.budget.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="New Category" onClose={() => setShowModal(false)}>
          <SimpleForm
            fields={[
              { label: "Name", key: "name", placeholder: "e.g. Food" },
              { label: "Icon", key: "icon", placeholder: "Tag" },
              { label: "Color", key: "color", placeholder: "oklch(0.65 0.21 280)" },
              { label: "Budget (monthly)", key: "budget", type: "number", placeholder: "0" },
            ]}
            submitLabel="Create Category"
            onSubmit={async (vals) => {
              const req: CreateCategoryRequest = {
                name: vals.name,
                icon: vals.icon || "Tag",
                color: vals.color || "oklch(0.65 0.21 280)",
                budget: parseFloat(vals.budget) || 0,
              };
              await createCategory(req);
              setShowModal(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Finance App Shell ────────────────────────────────────────────────────────

type FinanceTab = "wallets" | "transactions" | "categories";

export default function FinanceAppView() {
  const [tab, setTab] = useState<FinanceTab>("wallets");

  return (
    <AppShell title="Finance">
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--color-border)",
          marginBottom: "1.5rem",
        }}
      >
        {(["wallets", "transactions", "categories"] as FinanceTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "transparent",
              color: tab === t ? "var(--color-primary)" : "var(--color-muted)",
              fontWeight: tab === t ? 600 : 400,
              fontSize: "0.875rem",
              cursor: "pointer",
              borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
              marginBottom: "-1px",
              transition: "color 0.15s",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "wallets" && <WalletsTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "categories" && <CategoriesTab />}
    </AppShell>
  );
}

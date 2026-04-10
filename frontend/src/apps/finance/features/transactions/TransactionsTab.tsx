import { useEffect, useState } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";
import { createTransaction, getTransactions, type TransactionRead, getWallets, getCategories, type WalletRead, type CategoryRead } from "../../api";
import type { CreateTransactionRequest } from "../../api";
import Modal from "../../components/Modal";
import SimpleForm from "../../components/SimpleForm";
import TransactionEditForm from "../../components/TransactionEditForm";
import { formatCurrency } from "../../lib/formatCurrency";
import { useTimezone } from "@/shared/hooks/useTimezone";

const TRANSACTION_TYPE_VALUES = ["income", "expense"] as const satisfies readonly CreateTransactionRequest["type"][];

function isTransactionType(value: string): value is CreateTransactionRequest["type"] {
  return TRANSACTION_TYPE_VALUES.some((candidate) => candidate === value);
}

export default function TransactionsTab() {
  const { formatDate } = useTimezone();
  const [transactions, setTransactions] = useState<TransactionRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRead | null>(null);
  const [wallets, setWallets] = useState<WalletRead[]>([]);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getTransactions({ limit: 50 })
      .then(setTransactions)
      .catch((error: unknown) => {
        console.error("Failed to load transactions", error);
      })
      .finally(() => setLoading(false));
  }

  function loadWalletsAndCategories() {
    getWallets()
      .then(setWallets)
      .catch((error: unknown) => {
        console.error("Failed to load wallets", error);
      });
    getCategories()
      .then(setCategories)
      .catch((error: unknown) => {
        console.error("Failed to load categories", error);
      });
  }

  useEffect(() => {
    load();
    loadWalletsAndCategories();
  }, []);

  const categoryNameById = new Map(categories.map((category) => [category.id, category.name] as const));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Transaction
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--color-foreground-muted)" }}>Loading…</p>
      ) : transactions.length === 0 ? (
        <p style={{ color: "var(--color-foreground-muted)" }}>No transactions yet.</p>
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
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  onClick={() => setEditingTransaction(transaction)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatDate(transaction.date, { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: "0.125rem 0.5rem",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        background:
                          transaction.type === "income"
                            ? "oklch(0.72 0.19 145 / 0.15)"
                            : "oklch(0.63 0.24 25 / 0.15)",
                        color:
                          transaction.type === "income"
                            ? "var(--color-success)"
                            : "var(--color-danger)",
                      }}
                    >
                      {transaction.type}
                    </span>
                  </td>
                  <td>{categoryNameById.get(transaction.category_id) ?? "—"}</td>
                  <td
                    className={transaction.type === "income" ? "amount-positive" : "amount-negative"}
                    style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                  >
                    {transaction.type === "income" ? "+" : "-"}
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td style={{ color: "var(--color-foreground-muted)", maxWidth: "200px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {transaction.note ?? "—"}
                      </span>
                      <DynamicIcon name="Pencil" size={14} style={{ color: "var(--color-foreground-muted)", flexShrink: 0 }} />
                    </div>
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
            onSubmit={async (values) => {
              const transactionType = isTransactionType(values.type) ? values.type : "expense";
              const request: CreateTransactionRequest = {
                wallet_id: values.wallet_id,
                category_id: values.category_id,
                type: transactionType,
                amount: parseFloat(values.amount),
                date: new Date(values.date).toISOString(),
                note: values.note || undefined,
              };
              await createTransaction(request);
              setShowModal(false);
              load();
            }}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editingTransaction && wallets.length > 0 && categories.length > 0 && (
        <Modal title="Edit Transaction" onClose={() => setEditingTransaction(null)}>
          <TransactionEditForm
            transaction={editingTransaction}
            wallets={wallets}
            categories={categories}
            onSave={(updated) => {
              setTransactions((current) =>
                current.map((t) => (t.id === updated.id ? updated : t))
              );
              setEditingTransaction(null);
            }}
            onCancel={() => setEditingTransaction(null)}
          />
        </Modal>
      )}
    </div>
  );
}

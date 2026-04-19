import { useCallback, useEffect, useMemo, useState } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { useDisclosure } from "@/hooks/useDisclosure";
import { AppModal } from "@/shared/components/AppModal";
import { dateInputValueToUtcIso, toDateInputValue } from "@/shared/utils/datetime";
import { createTransaction, getTransactions, type TransactionRead, getWallets, getCategories, type WalletRead, type CategoryRead } from "../../api";
import type { CreateTransactionRequest } from "../../api";
import SimpleForm from "../../components/SimpleForm";
import TransactionEditForm from "../../components/TransactionEditForm";
import { formatCurrency } from "../../lib/formatCurrency";
import { useTimezone } from "@/shared/hooks/useTimezone";

const TRANSACTION_TYPE_VALUES = ["income", "expense"] as const satisfies readonly CreateTransactionRequest["type"][];

function isTransactionType(value: string): value is CreateTransactionRequest["type"] {
  return TRANSACTION_TYPE_VALUES.some((candidate) => candidate === value);
}

export default function TransactionsTab() {
  const { formatWeekdayDate } = useTimezone();
  const [transactions, setTransactions] = useState<TransactionRead[]>([]);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRead | null>(null);
  const [wallets, setWallets] = useState<WalletRead[]>([]);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const createTransactionModal = useDisclosure();
  const { isPending: loading, run } = useAsyncTask(true);

  const load = useCallback(async () => {
    try {
      const [nextTransactions, nextWallets, nextCategories] = await run(() =>
        Promise.all([
          getTransactions({ limit: 50 }),
          getWallets(),
          getCategories(),
        ])
      );
      setTransactions(nextTransactions);
      setWallets(nextWallets);
      setCategories(nextCategories);
    } catch (error: unknown) {
      console.error("Failed to load finance transaction data", error);
    }
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name] as const)),
    [categories]
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button className="btn btn-primary" onClick={createTransactionModal.open}>
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
                    {formatWeekdayDate(transaction.date, { year: "numeric" })}
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

      {createTransactionModal.isOpen && (
        <AppModal title="New Transaction" onClose={createTransactionModal.close}>
          <SimpleForm
            fields={[
              {
                label: "Wallet",
                key: "wallet_id",
                initialValue: wallets[0]?.id ?? "",
                options: wallets.map((wallet) => ({
                  label: `${wallet.name} (${wallet.currency})`,
                  value: wallet.id,
                })),
              },
              {
                label: "Category",
                key: "category_id",
                initialValue: categories[0]?.id ?? "",
                options: categories.map((category) => ({
                  label: category.name,
                  value: category.id,
                })),
              },
              {
                label: "Type",
                key: "type",
                options: TRANSACTION_TYPE_VALUES.map((value) => ({
                  label: value === "income" ? "Income" : "Expense",
                  value,
                })),
                initialValue: "expense",
              },
              { label: "Amount", key: "amount", type: "number", placeholder: "0.00" },
              {
                label: "Date",
                key: "date",
                type: "date",
                initialValue: toDateInputValue(new Date()),
              },
              { label: "Note", key: "note", placeholder: "Lunch at restaurant", required: false },
            ]}
            submitLabel="Add Transaction"
            onSubmit={async (values) => {
              const transactionType = isTransactionType(values.type) ? values.type : "expense";
              const amount = Number.parseFloat(values.amount);
              if (!Number.isFinite(amount) || amount <= 0) {
                throw new Error("Amount must be greater than 0");
              }

              const date = dateInputValueToUtcIso(values.date);
              if (!date) {
                throw new Error("Please select a valid transaction date");
              }

              const request: CreateTransactionRequest = {
                wallet_id: values.wallet_id,
                category_id: values.category_id,
                type: transactionType,
                amount,
                date,
                note: values.note || undefined,
              };
              await createTransaction(request);
              createTransactionModal.close();
              void load();
            }}
          />
        </AppModal>
      )}

      {/* Edit Modal */}
      {editingTransaction && wallets.length > 0 && categories.length > 0 && (
        <AppModal title="Edit Transaction" onClose={() => setEditingTransaction(null)}>
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
        </AppModal>
      )}
    </div>
  );
}

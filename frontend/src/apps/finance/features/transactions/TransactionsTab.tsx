import { useEffect, useState } from "react";
import type { CreateTransactionRequest } from "@/types/generated/api";
import { createTransaction, getTransactions, type TransactionRead } from "../../api";
import Modal from "../../components/Modal";
import SimpleForm from "../../components/SimpleForm";
import { formatCurrency } from "../../lib/formatCurrency";

export default function TransactionsTab() {
  const [transactions, setTransactions] = useState<TransactionRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getTransactions({ limit: 50 })
      .then(setTransactions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Transaction
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--color-muted)" }}>Loading…</p>
      ) : transactions.length === 0 ? (
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
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(transaction.date).toLocaleDateString()}
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
                  <td>{transaction.category?.name ?? "—"}</td>
                  <td
                    className={transaction.type === "income" ? "amount-positive" : "amount-negative"}
                    style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                  >
                    {transaction.type === "income" ? "+" : "-"}
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td style={{ color: "var(--color-muted)", maxWidth: "200px" }}>
                    {transaction.note ?? "—"}
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
              const request: CreateTransactionRequest = {
                wallet_id: values.wallet_id,
                category_id: values.category_id,
                type: values.type as "income" | "expense",
                amount: parseFloat(values.amount),
                date: new Date(values.date),
                note: values.note || undefined,
              };
              await createTransaction(request);
              setShowModal(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

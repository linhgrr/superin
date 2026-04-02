import { useState } from "react";
import type { FormEvent } from "react";
import type { TransactionRead, WalletRead, CategoryRead } from "../api";
import { updateTransaction } from "../api";

interface TransactionEditFormProps {
  transaction: TransactionRead;
  wallets: WalletRead[];
  categories: CategoryRead[];
  onSave: (transaction: TransactionRead) => void;
  onCancel: () => void;
}

export default function TransactionEditForm({
  transaction,
  wallets,
  categories,
  onSave,
  onCancel,
}: TransactionEditFormProps) {
  const [amount, setAmount] = useState(String(transaction.amount));
  const [date, setDate] = useState(transaction.date.slice(0, 10));
  const [note, setNote] = useState(transaction.note || "");
  const [walletId, setWalletId] = useState(transaction.wallet_id);
  const [categoryId, setCategoryId] = useState(transaction.category_id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!amount.trim() || Number(amount) <= 0) return;

    setLoading(true);
    setError(null);
    try {
      const updated = await updateTransaction(transaction.id, {
        amount: Number(amount),
        date: new Date(date).toISOString(),
        note: note.trim() || undefined,
        wallet_id: walletId,
        category_id: categoryId,
        type: transaction.type,
      });
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update transaction");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-muted)",
            }}
          >
            Amount
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-muted)",
            }}
          >
            Date
          </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-muted)",
            }}
          >
            Wallet
          </label>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)} required>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} ({wallet.currency})
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-muted)",
            }}
          >
            Category
          </label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            marginBottom: "0.25rem",
            color: "var(--color-muted)",
          }}
        >
          Note
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note"
        />
      </div>

      <div
        style={{
          padding: "0.5rem 0.75rem",
          background: "var(--color-surface-elevated)",
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
          color: "var(--color-muted)",
        }}
      >
        Type: <strong>{transaction.type}</strong>
      </div>

      {error && <p style={{ color: "var(--color-danger)", fontSize: "0.875rem", margin: 0 }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !amount.trim() || Number(amount) <= 0}
        >
          {loading ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

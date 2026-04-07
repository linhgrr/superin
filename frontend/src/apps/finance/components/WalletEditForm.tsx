import { useState } from "react";
import type { FormEvent } from "react";
import type { WalletRead } from "../api";
import { updateWallet } from "../api";

interface WalletEditFormProps {
  wallet: WalletRead;
  onSave: (wallet: WalletRead) => void;
  onCancel: () => void;
}

export default function WalletEditForm({ wallet, onSave, onCancel }: WalletEditFormProps) {
  const [name, setName] = useState(wallet.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const updated = await updateWallet(wallet.id, { name: name.trim() });
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update wallet");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            marginBottom: "0.25rem",
            color: "var(--color-foreground-muted)",
          }}
        >
          Wallet Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter wallet name"
          autoFocus
          required
        />
      </div>

      <div
        style={{
          padding: "0.75rem",
          background: "var(--color-surface-elevated)",
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
        }}
      >
        <div style={{ color: "var(--color-foreground-muted)", marginBottom: "0.25rem" }}>Currency</div>
        <div style={{ fontWeight: 500 }}>{wallet.currency}</div>
      </div>

      <div
        style={{
          padding: "0.75rem",
          background: "var(--color-surface-elevated)",
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
        }}
      >
        <div style={{ color: "var(--color-foreground-muted)", marginBottom: "0.25rem" }}>Balance</div>
        <div style={{ fontWeight: 500 }}>
          {wallet.balance.toLocaleString()} {wallet.currency}
        </div>
      </div>

      {error && <p style={{ color: "var(--color-danger)", fontSize: "0.875rem", margin: 0 }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
          {loading ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { createWallet, getWallets, type WalletRead } from "../../api";
import type { CreateWalletRequest } from "../../api";
import Modal from "../../components/Modal";
import SimpleForm from "../../components/SimpleForm";
import WalletEditForm from "../../components/WalletEditForm";
import { formatCurrency } from "../../lib/formatCurrency";

export default function WalletsTab() {
  const [wallets, setWallets] = useState<WalletRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletRead | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getWallets()
      .then(setWallets)
      .catch((error: unknown) => {
        console.error("Failed to load wallets", error);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const total = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <p className="section-label">Total Balance</p>
          <div className="stat-value">{formatCurrency(total)}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Wallet
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--color-foreground-muted)" }}>Loading…</p>
      ) : wallets.length === 0 ? (
        <p style={{ color: "var(--color-foreground-muted)" }}>No wallets yet. Create one to get started.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              style={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.75rem",
                padding: "1rem",
                position: "relative",
              }}
            >
              <button
                className="btn btn-ghost"
                onClick={() => setEditingWallet(wallet)}
                style={{ position: "absolute", top: "0.5rem", right: "0.5rem", padding: "0.25rem" }}
                title="Edit wallet"
              >
                <Pencil size={14} />
              </button>
              <p style={{ fontWeight: 600, margin: "0 0 0.25rem" }}>{wallet.name}</p>
              <p
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  fontFamily: "var(--font-heading)",
                  margin: 0,
                  color: wallet.balance >= 0 ? "var(--color-success)" : "var(--color-danger)",
                }}
              >
                {formatCurrency(wallet.balance, wallet.currency)}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", margin: "0.25rem 0 0" }}>
                {wallet.currency}
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
            onSubmit={async (values) => {
              const request: CreateWalletRequest = {
                name: values.name,
                currency: values.currency || "USD",
              };
              await createWallet(request);
              setShowModal(false);
              load();
            }}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editingWallet && (
        <Modal title="Edit Wallet" onClose={() => setEditingWallet(null)}>
          <WalletEditForm
            wallet={editingWallet}
            onSave={(updated) => {
              setWallets((current) =>
                current.map((w) => (w.id === updated.id ? updated : w))
              );
              setEditingWallet(null);
            }}
            onCancel={() => setEditingWallet(null)}
          />
        </Modal>
      )}
    </div>
  );
}

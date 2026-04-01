import { useState } from "react";
import CategoriesTab from "../features/categories/CategoriesTab";
import TransactionsTab from "../features/transactions/TransactionsTab";
import WalletsTab from "../features/wallets/WalletsTab";

type FinanceTab = "wallets" | "transactions" | "categories";

export default function FinanceScreen() {
  const [tab, setTab] = useState<FinanceTab>("wallets");

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--color-border)",
          marginBottom: "1.5rem",
        }}
      >
        {(["wallets", "transactions", "categories"] as FinanceTab[]).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "transparent",
              color: tab === value ? "var(--color-primary)" : "var(--color-muted)",
              fontWeight: tab === value ? 600 : 400,
              fontSize: "0.875rem",
              cursor: "pointer",
              borderBottom: tab === value ? "2px solid var(--color-primary)" : "2px solid transparent",
              marginBottom: "-1px",
              transition: "color 0.15s",
              textTransform: "capitalize",
            }}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === "wallets" && <WalletsTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "categories" && <CategoriesTab />}
    </>
  );
}

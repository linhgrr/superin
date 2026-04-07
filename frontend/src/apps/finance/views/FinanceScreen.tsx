import { useState } from "react";
import CategoriesTab from "../features/categories/CategoriesTab";
import TransactionsTab from "../features/transactions/TransactionsTab";
import WalletsTab from "../features/wallets/WalletsTab";
import BudgetCheckPanel from "../components/BudgetCheckPanel";
import CategoryBreakdownChart from "../components/CategoryBreakdownChart";
import MonthlyTrendChart from "../components/MonthlyTrendChart";

type FinanceTab = "wallets" | "transactions" | "categories" | "analytics";

export default function FinanceScreen() {
  const [tab, setTab] = useState<FinanceTab>("wallets");

  const now = new Date();

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
        {(["wallets", "transactions", "categories", "analytics"] as FinanceTab[]).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "transparent",
              color: tab === value ? "var(--color-primary)" : "var(--color-foreground-muted)",
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
      {tab === "analytics" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <section>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Budget Status</h3>
            <BudgetCheckPanel />
          </section>
          <section>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
              Spending by Category ({now.getMonth() + 1}/{now.getFullYear()})
            </h3>
            <CategoryBreakdownChart month={now.getMonth() + 1} year={now.getFullYear()} />
          </section>
          <section>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Monthly Trend (6 months)</h3>
            <MonthlyTrendChart months={6} />
          </section>
        </div>
      )}
    </>
  );
}

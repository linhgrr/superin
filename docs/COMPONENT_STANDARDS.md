# Component Standards

> **Áp dụng cho:** Mọi React/TypeScript component trong `frontend/src/`
> **Mục tiêu:** Tái sử dụng, maintain được, test được.

---

## 1. Đặt Tên (Naming)

### 1.1 File names

```
components/
├── CamelCase.tsx          ← components
├── CamelCase.test.tsx     ← tests cùng thư mục
└── camelCase.module.css   ← scoped CSS (nếu cần)
```

| Loại | Quy tắc | Ví dụ |
|------|---------|-------|
| Component file | PascalCase | `StatCard.tsx`, `AppShell.tsx` |
| Utility/helper | camelCase | `formatCurrency.ts`, `useWallets.ts` |
| Type file | camelCase | `widget.types.ts`, `auth.types.ts` |
| Hook file | camelCase | `useAuth.ts`, `useStreamingChat.ts` |
| Config file | camelCase/kebab | `vite.config.ts`, `codegen.yaml` |

### 1.2 Export names

```tsx
// ✅ Named export cho component
export function StatCard({ label, value }: Props) { ... }

// ✅ Default export cho page/layout (để lazy load được)
export default function DashboardPage() { ... }

// ✅ Re-export từ barrel file
export { StatCard } from "./StatCard";
export { SectionHeader } from "./SectionHeader";
```

### 1.3 Biến và prop names

```tsx
// ✅ camelCase cho biến cục bộ
const isLoading = true;
const walletBalance = "$1,200";

// ✅ PascalCase cho component trong JSX
<StatCard label="Balance" value="$500" />
<TransactionList items={transactions} />

// ✅ Prop types luôn có suffix Props
interface StatCardProps { ... }
interface TransactionListProps { items: Transaction[]; onSelect?: (id: string) => void }
```

---

## 2. Component Structure

### 2.1 Thứ tự trong file

```tsx
// 1. Imports (external → internal → relative)
// 2. Types / Interfaces
// 3. Constants / configs
// 4. Component function
// 5. Helper functions (nếu cần, đặt sau component)
// 6. Default export (nếu là page/layout)

import { Card } from "@heroui/react";
import { Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { StatCard } from "@/components/ui/design-system";
import type { Transaction } from "@/types/generated/api";

interface Props {
  transactions: Transaction[];
  onSelect?: (id: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  food: "oklch(0.63 0.24 25)",
  transport: "oklch(0.65 0.21 280)",
};

export function TransactionList({ transactions, onSelect }: Props) {
  // hooks
  const { user } = useAuth();

  // early return
  if (!transactions.length) {
    return <EmptyState />;
  }

  // render
  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <TransactionRow key={tx.id} tx={tx} onSelect={onSelect} />
      ))}
    </div>
  );
}

function EmptyState() {
  return <p className="text-sm" style={{ color: "oklch(0.55 0.02 265)" }}>No transactions yet.</p>;
}

export default TransactionList;
```

### 2.2 Component quá dài — tách ra

Nếu component > 100 lines → tách thành sub-components:

```tsx
// ❌ Bad — 1 file quá dài
export function TransactionsPage() {
  const [txs, setTxs] = useState([]);
  // ... 200 lines
}

// ✅ Good — tách thành module
export function TransactionsPage() {
  return <TransactionsContent />;
}

function TransactionsContent() {
  const [txs, setTxs] = useState([]);
  return <TransactionList txs={txs} />;
}
```

### 2.3 Never export named component mà không có displayName

```tsx
// ✅ Correct
export function StatCard({ label, value }: Props) {
  return <Card>...</Card>;
}
StatCard.displayName = "StatCard";

// ✅ Hoặc dùng named export — không cần displayName
export function StatCard({ label, value }: Props) {
  return <Card>...</Card>;
}
```

---

## 3. Props & Types

### 3.1 Prop types

```tsx
// ✅ Always use explicit interface — never inline
interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

// ❌ Never
function StatCard({ label, value, icon, trend, className }) { ... }
```

### 3.2 Optional props phải có default

```tsx
// ✅ Optional props có default
interface Props {
  size?: "small" | "medium";
  onChange?: (value: string) => void;
}

function Widget({ size = "medium", onChange }: Props) {
  // ...
}

// ✅ Callback props — explicit types
onSelect?: (transaction: Transaction) => void;
onError?: (error: Error) => void;
```

### 3.3 Dùng type, không any

```tsx
// ✅
const total = transactions.reduce((sum: number, tx: Transaction) => sum + tx.amount, 0);

// ❌
const total = transactions.reduce((sum, tx) => sum + tx.amount, 0); // any inferred
```

---

## 4. Styling

### 4.1 Priority: Tailwind → CSS classes → inline styles

```tsx
// ✅ Ưu tiên Tailwind
<div className="flex items-center gap-2 p-4">

// ✅ CSS classes cho reusable patterns
<div className="widget-card">

// ✅ Inline chỉ khi dùng design token
<div style={{ color: "oklch(0.95 0.01 265)" }}>

// ❌ Hardcoded non-token values
<div style={{ background: "#1a1a2e" }}>   ← dùng token
<div style={{ color: "white" }}>           ← dùng token
```

### 4.2 Design system tokens

Luôn dùng token từ `globals.css`:

```tsx
// ✅ Token
style={{ color: "oklch(0.95 0.01 265)" }}      // foreground
style={{ color: "oklch(0.55 0.02 265)" }}      // muted
style={{ color: "oklch(0.72 0.19 145)" }}      // success
style={{ background: "oklch(0.18 0.01 265)" }} // surface

// ✅ Shared CSS classes
className="widget-card"
className="stat-value"
className="amount-positive"
className="amount-negative"
className="section-label"

// ❌ Không hardcode
style={{ color: "#f3f4f6" }}
style={{ background: "rgba(26, 26, 46, 0.8)" }}
```

### 4.3 Responsive

```tsx
// ✅ Mobile-first với Tailwind breakpoints
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

// ✅ Widget size classes cho grid
<div className="widget-small">
<div className="widget-medium">
<div className="widget-large">
<div className="widget-full-width">
```

---

## 5. Data Fetching

### 5.1 Luôn dùng hook hoặc useEffect

```tsx
// ✅ useEffect cho simple fetch
function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    api.get("/api/apps/finance/wallets").then(setWallets);
  }, []);

  return <WalletList wallets={wallets} />;
}

// ✅ Custom hook cho logic phức tạp
function WalletsPage() {
  const { wallets, isLoading, createWallet } = useWallets();
  return <WalletList wallets={wallets} isLoading={isLoading} onCreate={createWallet} />;
}

// ❌ Không await trong render
function WalletsPage() {
  const wallets = await api.get("/api/apps/finance/wallets"); // ❌
}
```

### 5.2 Loading + Error states

```tsx
// ✅ Luôn handle loading và error
function WalletsPage() {
  const { data, isLoading, error } = useSWR("/api/apps/finance/wallets", fetcher);

  if (isLoading) return <WidgetSkeleton />;
  if (error) return <ErrorMessage message={error.message} />;
  return <WalletList wallets={data} />;
}
```

---

## 6. Imports

### 6.1 Thứ tự import

```tsx
// 1. External libraries
import { useState, useEffect } from "react";
import { Card, Button } from "@heroui/react";
import { Wallet, Calendar } from "lucide-react";
import { useRouter } from "react-router-dom";

// 2. Internal packages (hoặc dùng @/ alias)
import { StatCard, SectionHeader } from "@/components/ui/design-system";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/api/client";
import type { Transaction } from "@/types/generated/api";

// 3. Relative imports
import { TransactionRow } from "./TransactionRow";
import "./TransactionList.css";
```

### 6.2 Barrel exports

```tsx
// ✅ Dùng barrel (index.ts) cho shared modules
import { StatCard } from "@/components/ui/design-system";

// ❌ Deep import khi barrel có sẵn
import { StatCard } from "@/components/ui/design-system/StatCard";
```

---

## 7. Testing

### 7.1 Unit test conventions

```tsx
// File: WidgetGrid.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { WidgetGrid } from "./WidgetGrid";

describe("WidgetGrid", () => {
  it("renders empty state when no widgets", () => {
    render(<WidgetGrid widgets={[]} />);
    expect(screen.getByText(/no widgets/i)).toBeInTheDocument();
  });

  it("renders widget with correct size class", () => {
    render(<WidgetGrid widgets={[{ id: "f.tb", size: "medium" }]} />);
    const widget = screen.getByTestId("widget-f-tb");
    expect(widget.className).toContain("widget-medium");
  });
});
```

### 7.2 Test những gì

| Nên test | Không cần test |
|----------|---------------|
| Component render với data đúng | Implementation details |
| User interaction (click, input) | Styling (className strings) |
| Loading / error states | Third-party library internals |
| Edge cases (empty array, null) | Snapshot tests cho UI |
| Conditional rendering logic | |

---

## 8. Checklist Trước Khi Merge

```markdown
- [ ] Component có TypeScript interface đầy đủ (không any)
- [ ] Props optional có default values
- [ ] Sử dụng design system tokens (không hardcoded colors)
- [ ] Loading + error states được handle
- [ ] Props destructured đúng cách
- [ ] Không console.log thừa (debug xóa trước merge)
- [ ] File name = component name (PascalCase)
- [ ] DisplayName set (hoặc named export)
- [ ] Nếu > 100 lines → tách sub-component
- [ ] Unit test viết cho logic phức tạp
- [ ] Import order đúng (external → internal → relative)
```

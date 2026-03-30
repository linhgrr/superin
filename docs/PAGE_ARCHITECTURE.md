# Shin SuperApp v2.1 — Page Architecture

> **Mục tiêu:** Mỗi app có cấu trúc page riêng, dùng chung layout component của dashboard.

---

## 1. URL Structure

```
/                          → redirect /dashboard
/login                     → LoginPage
/dashboard                 → DashboardPage (WidgetGrid + Chat)
/store                    → StorePage (app catalog)

/apps/finance              → FinancePage /overview (default)
  /apps/finance/overview   → FinanceOverview
  /apps/finance/wallets    → WalletsPage
  /apps/finance/categories → CategoriesPage
  /apps/finance/transactions → TransactionsPage

/apps/todo                 → TodoPage /tasks (default)
  /apps/todo/tasks         → TaskListPage
  /apps/todo/settings      → TodoSettingsPage
```

---

## 2. Layout Hierarchy

```
AppShell (3-column grid)
│
├── Sidebar (shared — app list)
│
├── Main content
│   └── AppLayout (app-specific layout)
│       ├── AppHeader (name + nav tabs)
│       │   └── AppNav (Overview | Wallets | Categories | ...)
│       └── <Outlet /> (nested route)
│
└── ChatPanel (shared — always visible)
```

### AppShell — 3-column grid (shared)

```tsx
// frontend/src/components/dashboard/AppShell.tsx

export function AppShell({
  children,        // main content column
  nav,             // optional: top nav for app pages
}: {
  children: React.ReactNode;
  nav?: React.ReactNode;
}) {
  return (
    <div className="dashboard-grid">
      {/* Col 1: sidebar — app list */}
      <aside className="sidebar flex flex-col">
        <AppList />           {/* Finance, Todo, Calendar... */}
        <div className="flex-1" />
        <UserMenu />          {/* avatar, settings */}
      </aside>

      {/* Col 2: main content */}
      <main className="flex flex-col overflow-auto">
        {nav && (
          <div className="px-6 pt-4 border-b" style={{ borderColor: "oklch(0.22 0.02 265)" }}>
            {nav}
          </div>
        )}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>

      {/* Col 3: chat */}
      <aside className="flex flex-col">
        <ChatThread />
      </aside>
    </div>
  );
}
```

### AppLayout — wrapper cho mỗi app

```tsx
// frontend/src/apps/finance/layout.tsx

import { AppShell } from "@/components/dashboard/AppShell";
import { AppNav } from "./AppNav";

const NAV_ITEMS = [
  { href: "/apps/finance/overview",       label: "Overview",       icon: PieChart },
  { href: "/apps/finance/wallets",          label: "Wallets",       icon: Wallet },
  { href: "/apps/finance/categories",       label: "Categories",    icon: Tag },
  { href: "/apps/finance/transactions",     label: "Transactions",  icon: ArrowLeftRight },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      nav={<AppNav items={NAV_ITEMS} baseHref="/apps/finance" />}
    >
      {children}
    </AppShell>
  );
}
```

```tsx
// frontend/src/apps/finance/AppNav.tsx

import { Link, useLocation } from "react-router-dom";

export function AppNav({ items, baseHref }: {
  items: { href: string; label: string; icon: React.ElementType }[];
  baseHref: string;
}) {
  const location = useLocation();

  return (
    <nav className="flex items-center gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const isActive = location.pathname === href;
        return (
          <Link
            key={href}
            to={href}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              background: isActive ? "oklch(0.65 0.21 280 / 0.12)" : "transparent",
              color: isActive ? "oklch(0.65 0.21 280)" : "oklch(0.55 0.02 265)",
            }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

---

## 3. Routing

```tsx
// frontend/src/App.tsx

<Routes>
  <Route path="/" element={<Navigate to="/dashboard" />} />
  <Route path="/login" element={<LoginPage />} />

  <Route path="/dashboard" element={<DashboardPage />} />

  {/* App routes — nested, each app has its own layout */}
  <Route path="/apps/finance" element={<FinanceLayout />}>
    <Route index element={<Navigate to="/apps/finance/overview" replace />} />
    <Route path="overview"      element={<FinanceOverview />} />
    <Route path="wallets"       element={<WalletsPage />} />
    <Route path="categories"    element={<CategoriesPage />} />
    <Route path="transactions"  element={<TransactionsPage />} />
  </Route>

  <Route path="/apps/todo" element={<TodoLayout />}>
    <Route index element={<Navigate to="/apps/todo/tasks" replace />} />
    <Route path="tasks"    element={<TaskListPage />} />
    <Route path="settings" element={<TodoSettingsPage />} />
  </Route>

  <Route path="/store" element={<StorePage />} />
</Routes>
```

---

## 4. Finance App — Tất Cả Pages

```
frontend/src/apps/finance/
├── layout.tsx              ← FinanceLayout (AppShell + AppNav)
├── AppNav.tsx              ← Navigation tabs
├── pages/
│   ├── FinanceOverview.tsx     ← Tổng quan: stat cards + mini widgets
│   ├── WalletsPage.tsx         ← Quản lý ví
│   ├── CategoriesPage.tsx      ← Quản lý danh mục
│   └── TransactionsPage.tsx    ← Danh sách + form giao dịch
└── widgets/                     ← Dashboard widgets
    ├── TotalBalance.tsx
    ├── BudgetOverview.tsx
    ├── RecentTransactions.tsx
    └── index.ts
```

### FinanceOverview — dashboard-style overview

```tsx
// frontend/src/apps/finance/pages/FinanceOverview.tsx

export function FinanceOverview() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Balance" value="$12,500" icon={<Wallet />} />
        <StatCard label="This Month" value="-$3,400" trend={{ value: "12%", positive: false }} />
        <StatCard label="Daily Allowance" value="$45" />
        <StatCard label="Categories" value="8" />
      </div>

      {/* Charts + lists */}
      <div className="grid grid-cols-2 gap-4">
        <BudgetChart />
        <RecentTransactions compact />
      </div>
    </div>
  );
}
```

### TransactionsPage — full CRUD page

```tsx
// frontend/src/apps/finance/pages/TransactionsPage.tsx

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState({ type: "all", category: "" });

  useEffect(() => {
    api.get("/api/apps/finance/transactions", { params: filter })
       .then(setTransactions);
  }, [filter]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Transactions" action={
        <Button color="primary" size="sm">+ Add</Button>
      } />
      <TransactionFilters filter={filter} onChange={setFilter} />
      <TransactionTable data={transactions} />
    </div>
  );
}
```

---

## 5. Todo App — Pages

```
frontend/src/apps/todo/
├── layout.tsx              ← TodoLayout
├── AppNav.tsx
├── pages/
│   ├── TaskListPage.tsx    ← Danh sách task chính
│   └── SettingsPage.tsx
└── widgets/
    ├── TaskList.tsx
    ├── TodayWidget.tsx
    └── index.ts
```

---

## 6. Shared Patterns (Component Conventions)

### Page Structure — đúng pattern

```tsx
// ✅ Correct page pattern
export function SomePage() {
  return (
    <div className="space-y-6">        {/* Page-level vertical spacing */}
      <SectionHeader
        title="PAGE TITLE"           {/* uppercase, tracked */}
        action={<Button>+ Add</Button>}
      />
      {/* Content */}
    </div>
  );
}

// ❌ Wrong — never do this
export function SomePage() {
  return (
    <div>                          {/* No spacing class */}
      <h2 className="text-xl">...</h2>
      <div className="my-8">       {/* Inconsistent spacing */}
      ...
```

### Chiều cao page — luôn full-height

```tsx
// ✅ Page fills available height, content scrolls inside
export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      {children}
    </div>
  );
}

// ❌ Never
<div style={{ minHeight: "100vh" }}>
```

### Inline data fetching — luôn dùng hook

```tsx
// ✅ Correct — data fetching in hook or component
function WalletsPage() {
  const { data: wallets, isLoading } = useSWR("/api/apps/finance/wallets", fetcher);

  if (isLoading) return <WidgetSkeleton />;
  return <WalletList data={wallets} />;
}

// ❌ Wrong — no async in render
function WalletsPage() {
  const wallets = await api.get(...); // Cannot await in render
```

### Re-export từ layout

```tsx
// ✅ App pages exported từ app layout
export { default } from "../layout";   // FinanceLayout
export { FinanceOverview } from "./pages/FinanceOverview";
export { WalletsPage } from "./pages/WalletsPage";
```

### Widget vs App Page — khác nhau

| | Widget | App Page |
|---|---|---|
| Rendered in | Dashboard WidgetGrid | Full main column |
| Height | Content-driven | Full height + internal scroll |
| Layout | Single card | Page structure (SectionHeader + content) |
| Data fetching | Self-fetch, compact | Self-fetch or hook, full CRUD |
| Size class | From manifest | Always fills column |
| Navigation | None | Own nav tabs |

### Luôn dùng shared components

```tsx
import { StatCard, SectionHeader } from "@/components/ui/design-system";

// ✅ StatCard cho KPI
<StatCard label="Total" value="$1,200" icon={<Wallet />} />

// ✅ SectionHeader cho list/table headers
<SectionHeader title="TRANSACTIONS" action={<Button>Add</Button>} />

// ✅ WidgetCard cho dashboard widgets (not here — AppPage uses page structure)
```

---

## 7. App Sidebar — AppList Component

```tsx
// frontend/src/components/dashboard/AppList.tsx

const APPS = [
  { id: "finance",  name: "Finance",  icon: Wallet,        href: "/apps/finance/overview" },
  { id: "todo",     name: "To-Do",   icon: CheckSquare,   href: "/apps/todo/tasks" },
  // future apps
];

export function AppList() {
  const location = useLocation();
  const installedApps = useInstalledApps(); // from app catalog

  return (
    <div className="space-y-1 p-3">
      {installedApps.map((app) => {
        const active = location.pathname.startsWith(`/apps/${app.id}`);
        return (
          <Link key={app.id} to={app.href} className={`app-item ${active ? "active" : ""}`}>
            <app.icon className="w-5 h-5" />
            <span>{app.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
```

---

## 8. Rules — tái sử dụng & maintain

### R1: Mỗi app có layout riêng

```tsx
// frontend/src/apps/{appId}/layout.tsx
// BẮT BUỘC — tạo file này cho mỗi app mới
export default function {App}Layout({ children }) {
  return <AppShell nav={<{App}Nav />}>{children}</AppShell>;
}
```

### R2: Pages tách riêng data fetching

```tsx
// ✅ Data fetching trong component hoặc hook
function TransactionsPage() {
  const { data } = useSWR("/api/apps/finance/transactions", fetcher);
  return <TransactionTable data={data} />;
}

// ✅ Complex logic → extract thành hook
function WalletsPage() {
  return <WalletsDashboard hooks={useWallets()} />;
}
```

### R3: Shared layout không có app logic

```tsx
// AppShell.tsx — CHỈ chứa layout grid
// Không chứa: API calls, app-specific state, widget rendering logic
export function AppShell({ children, nav }) {
  return <div className="dashboard-grid">...</div>;
}
```

### R4: Navigation state từ URL

```tsx
// ✅ Nav active state từ useLocation (URL-driven)
const isActive = location.pathname === href;

// ❌ Nav state từ prop drilling hoặc context phức tạp
const { activeNav } = useAppContext();
```

### R5: App page không re-export widget

Widgets (Dashboard) khác App Page. Widget dùng cho `/dashboard`. App page là trang đầy đủ.

```tsx
// frontend/src/apps/finance/widgets/index.ts
// Đăng ký widget cho dashboard
registerWidget("finance.total-balance", TotalBalance);

// frontend/src/apps/finance/pages/FinanceOverview.tsx
// Trang app — KHÔNG gọi registerWidget
```

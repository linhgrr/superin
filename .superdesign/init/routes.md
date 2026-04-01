# Routes & Pages

## Route Structure

| Route | Component | Access | Description |
|-------|-----------|--------|-------------|
| `/` | Navigate to /dashboard | Public | Redirect |
| `/login` | LoginPage | Public only | Auth với tabs Login/Register |
| `/dashboard` | DashboardPage | Protected | Widget grid với drag-drop |
| `/store` | StorePage | Protected | App catalog với install/uninstall |
| `/apps/:appId` | AppPage | Protected | Individual app view |
| `*` | 404 Page | All | Simple 404 với back link |

## Page Components

### LoginPage (`src/pages/LoginPage.tsx`)
- Tabs: Login / Register
- Form validation client-side
- Error handling global và field-level
- Password visibility toggle
- Brand gradient và floating animation
- Dependencies: `useAuth`, `lucide-react`

### DashboardPage (`src/pages/DashboardPage.tsx`)
- ResponsiveGridLayout (react-grid-layout)
- Widget drag-and-drop với persisted positions
- AddWidgetDialog để toggle widget visibility
- Empty state với App Store CTA
- Loading skeletons (pulse animation)
- Dependencies: `react-grid-layout`, `lucide-react`, app registry

### StorePage (`src/pages/StorePage.tsx`)
- Grid và List view modes
- Category filtering (badges)
- Search functionality
- App cards với gradient icons
- Install/Uninstall actions
- Dependencies: `lucide-react`, catalog API

### AppPage (`src/pages/AppPage.tsx`)
- Dynamic app loading từ registry
- App-specific views (Finance, Todo)
- Header với navigation back
- Dependencies: `react-router`, app registry

### AppShell (`src/pages/AppShell.tsx`)
- Layout wrapper: Sidebar + Header + Content + Chat
- Grid layout: 260px | 1fr | 380px (responsive)
- Dependencies: `react-router`, `Sidebar`, `Header`, `ChatPanel`

## App Registry System

Apps được register trong `src/apps/index.ts`:
- `finance`: Finance dashboard với transactions, wallets, categories
- `todo`: Task management với lists
- `calendar`: (mới thêm) Event management

Each app exports:
- `DashboardWidget`: Widget hiển thị trong dashboard
- `AppView`: Full app view khi navigate to `/apps/:appId`

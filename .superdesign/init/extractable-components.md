# Extractable Components

## Components Ready for Reuse as DraftComponents

### 1. StatCard
**Current location**: Widget cards trong Dashboard
**Use case**: Hiển thị metrics với value, label, delta
**Extractable**: Yes — dùng chung cho Finance, Analytics apps

### 2. EmptyState
**Current location**: `globals.css` + inline trong pages
**Use case**: Empty lists, no data states
**Extractable**: Yes — cần thêm variants cho different contexts

### 3. AppIcon
**Current location**: `Sidebar.tsx`, `StorePage.tsx`
**Use case**: App icons với gradient backgrounds
**Extractable**: Yes — dùng trong Sidebar, Store, Widget headers

### 4. MessageBubble
**Current location**: `ChatThread.tsx`
**Use case**: Chat message display
**Extractable**: Yes — user và assistant variants

### 5. SearchInput
**Current location**: `StorePage.tsx`
**Use case**: Search với icon
**Extractable**: Yes — global search, table filtering

### 6. CategoryBadge
**Current location**: `StorePage.tsx`
**Use case**: Category filtering badges
**Extractable**: Yes — filters, tags, labels

### 7. Dialog
**Current location**: `globals.css` + `AddWidgetDialog`
**Use case**: Modal dialogs
**Extractable**: Yes — base dialog component

### 8. LoadingSkeleton
**Current location**: `globals.css` — animate-shimmer
**Use case**: Loading states
**Extractable**: Yes — card, text, table variants

## Components Needed (Not Yet Implemented)

### 1. CommandPalette
**Priority**: High
**Use case**: Quick navigation, command execution
**Scope**: Global component

### 2. ToastNotification
**Priority**: High
**Use case**: Success/error/warning notifications
**Scope**: Global provider + hook

### 3. DataTable
**Priority**: High
**Use case**: Data display với sorting, filtering
**Scope**: Shared component

### 4. ChartCard
**Priority**: Medium
**Use case**: Charts trong dashboard
**Scope**: Recharts wrapper

### 5. Breadcrumb
**Priority**: Medium
**Use case**: Navigation hierarchy
**Scope**: Layout component

### 6. SettingsLayout
**Priority**: Medium
**Use case**: Settings page structure
**Scope**: Full page component

### 7. OnboardingTour
**Priority**: Medium
**Use case**: New user guidance
**Scope**: Overlay component

### 8. CommandMenu
**Priority**: Low
**Use case**: Context menus
**Scope**: Right-click menus

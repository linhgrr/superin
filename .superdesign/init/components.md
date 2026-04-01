# Components Analysis

## Shared UI Components (from globals.css)

### Buttons
```css
.btn           /* Base button */
.btn-primary   /* Gradient coral */
.btn-secondary /* Surface elevated */
.btn-ghost     /* Transparent */
.btn-sm        /* Small size */
.btn-icon      /* Icon only */
```

### Cards
```css
.widget-card   /* Glassmorphism card */
.store-card    /* App store card */
.login-card    /* Auth card */
.dialog-panel  /* Modal dialog */
```

### Forms
```css
input, textarea, select  /* Base inputs */
.login-input            /* Auth specific */
.chat-input             /* Chat specific */
```

### Badges
```css
.badge          /* Base */
.badge-primary  /* Coral */
.badge-success  /* Green */
.badge-warning  /* Yellow */
.badge-danger   /* Red */
.badge-neutral  /* Gray */
```

### Layout
```css
.dashboard-grid     /* 3-column layout */
.sidebar            /* Glass sidebar */
.app-header         /* Glass header */
.widget-grid        /* 12-column grid */
.chat-container     /* Chat panel */
```

## React Components

### Dashboard Components

**AddWidgetDialog** (`src/components/dashboard/AddWidgetDialog.tsx`)
- Modal để toggle widget visibility
- List tất cả available widgets
- Enable/disable với toggle

**SortableWidgetCard** (`src/components/dashboard/SortableWidgetCard.tsx`)
- Wrapper cho widget với drag controls
- Remove button
- Hover controls

**EditModeBar** (`src/components/dashboard/EditModeBar.tsx`)
- Sticky bar khi editing dashboard
- Save/Cancel actions
- Drag hint

### Chat Components

**ChatThread** (`src/components/chat/ChatThread.tsx`)
- Message bubbles (user/assistant)
- Tool call badges
- Input area
- Auto-scroll

**ChatPanel** (`src/pages/ChatPanel.tsx`)
- Full chat sidebar
- Thread list
- New conversation button

### App Components

**Finance App** (`src/apps/finance/`)
- `DashboardWidget`: Budget overview, recent transactions, total balance
- `AppView`: Full finance management
- Components: Modal, SimpleForm
- Views: Transactions, Categories, Wallets

**Todo App** (`src/apps/todo/`)
- `DashboardWidget`: Task lists, today view
- `AppView`: Full task management
- Components: TaskRow, NewTaskForm
- Views: Tasks panel

## Custom Hooks

**useAuth** (`src/hooks/useAuth.tsx`)
- Authentication state
- Login/register/logout methods
- Token management

**useDashboardEdit** (`src/hooks/useDashboardEdit.tsx`)
- Edit mode state
- Widget reordering logic
- Save preferences

**useStreamingChat** (`src/hooks/useStreamingChat.ts`)
- WebSocket connection
- Streaming message handling
- Thread management

## Animation Classes

```css
.animate-fade-in        /* Fade + translateY */
.animate-fade-in-scale  /* Fade + scale */
.animate-slide-in-right /* Slide from right */
.animate-pulse          /* Opacity pulse */
.animate-shimmer        /* Shimmer loading */
.animate-float          /* Float animation */
.animate-spin           /* Rotation */
```

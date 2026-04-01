# Toast Notification & Command Palette — Usage Guide

## Toast Notification System

### Import
```tsx
import { useToast } from "@/components/providers/AppProviders";
```

### Usage
```tsx
function MyComponent() {
  const toast = useToast();

  // Success toast
  toast.success("Saved successfully");

  // Error toast with description
  toast.error("Failed to save", {
    description: "Please check your connection and try again"
  });

  // Warning with action button
  toast.warning("Unsaved changes", {
    description: "You have unsaved changes",
    action: { label: "Save", onClick: () => save() }
  });

  // Info toast with custom duration
  toast.info("New update available", {
    description: "Version 2.2.0 is now available",
    duration: 10000 // 10 seconds
  });
}
```

### Features
- 4 variants: `success`, `error`, `warning`, `info`
- Auto-dismiss with progress bar (default 5s)
- Pause on hover
- Max 5 toasts visible
- Action button support
- Smooth animations

---

## Command Palette

### Open
- **Keyboard**: `Cmd + K` (Mac) or `Ctrl + K` (Windows/Linux)
- **UI**: Click the Command icon in the header

### Features
- Search apps, actions, settings
- Recent commands tracking
- Keyboard navigation: `↑↓` + `Enter`
- Categories: Apps, Actions, Settings, Help

### Commands Available
| Command | Shortcut | Category |
|---------|----------|----------|
| Go to Dashboard | G D | Apps |
| Go to App Store | G S | Apps |
| Open [Installed App] | — | Apps |
| Add Widget | A W | Actions |
| Toggle Theme | T T | Actions |
| Theme Settings | — | Settings |
| Sign Out | — | Settings |
| Keyboard Shortcuts | ? | Help |

### Recent Commands
- Last 5 commands are saved to localStorage
- Recent commands appear first when palette opens

---

## Implementation Files

### New Files
- `src/components/providers/ToastProvider.tsx` — Toast system
- `src/components/providers/CommandPalette.tsx` — Command palette
- `src/components/providers/InnerProviders.tsx` — Split providers
- `src/components/providers/index.ts` — Barrel exports

### Modified Files
- `src/components/providers/AppProviders.tsx` — Added ToastProvider wrapper
- `src/App.tsx` — Added CommandPaletteWrapper with keyboard shortcut
- `src/pages/Header.tsx` — Added Command Palette button
- `src/pages/StorePage.tsx` — Added toast notifications for install/uninstall
- `src/app/globals.css` — Added toast animations

---

## Future Enhancements

### Toast
- [ ] Swipe to dismiss (mobile)
- [ ] Rich content support (React nodes)
- [ ] Toast position options (top-left, top-center, etc.)
- [ ] Promise toast (loading → success/error)

### Command Palette
- [ ] Settings page integration
- [ ] Keyboard shortcuts modal
- [ ] Custom user commands
- [ ] Search history

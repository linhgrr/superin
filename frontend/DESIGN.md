# Superin Design System

This document is the source of truth for visual design and theme behavior in the frontend.

## 1) Visual Direction

- Style: Industrial minimalism with warm neutrals and coral accents.
- Primary mood: high-contrast, focused, utility-first surfaces.
- Avoid: generic pastel SaaS look, random gradients, and inconsistent theme switching.

## 2) Source Files

- Theme tokens: `src/app/tokens.css`
- Shared components: `src/app/components.css`
- Shell/layout behavior: `src/app/layout.css`
- Runtime theme application: `src/lib/theme.ts`
- App bootstrap theme sync: `src/App.tsx` (`ThemeLoader`)
- User theme controls: `src/pages/settings/SettingsPage.tsx`
- Command palette theme toggle: `src/components/providers/command-palette/command-definitions.tsx`

## 3) Theme Tokens

### Core theme variables

Defined in `@theme` inside `src/app/tokens.css`:

- Primary accent: `--color-primary`, `--color-primary-hover`, `--color-primary-end`
- Surface scale: `--color-surface`, `--color-surface-elevated`, `--color-surface-floating`
- Background scale: `--color-background`, `--color-background-elevated`, `--color-background-sunken`
- Text scale: `--color-foreground`, `--color-foreground-muted`, `--color-foreground-subtle`
- Borders/rings: `--color-border`, `--color-border-subtle`, `--color-border-highlight`, `--color-ring`

### Typography tokens

- Display: `--font-display`
- Heading: `--font-heading`
- Body: `--font-sans`
- Mono: `--font-mono`

## 4) Theme Modes

Supported modes:

- `light`
- `dark`
- `system`

Runtime behavior is centralized in `src/lib/theme.ts`:

- `readStoredTheme()` reads `superin_settings.theme` from localStorage.
- `applyTheme(theme)` sets deterministic root classes on `<html>`:
  - adds exactly one of `.dark` / `.light`
  - removes the opposite class
- `resolveTheme("system")` maps OS preference to `light`/`dark`.
- `persistTheme(theme)` updates local storage with merge-safe behavior.

## 5) Theme Sync Rules

1. Never manually toggle root classes in feature pages.
2. Always use `applyTheme()` for visual mode changes.
3. Always use `persistTheme()` when a theme change is user intent.
4. Keep `ThemeLoader` in `App.tsx` so refresh/login routes inherit the same theme.
5. For `system` mode, listen to `prefers-color-scheme` changes and re-apply.

## 6) Responsive Layout Rules

### Breakpoints used by app shell

- Desktop wide: `> 1280`
- Desktop standard: `1025-1280`
- Tablet: `769-1024`
- Mobile: `<= 768`

### Sidebar behavior

- `> 1280`: full sidebar with labels
- `1025-1280`: full sidebar (narrower width) with labels
- `769-1024`: compact icon-first sidebar (labels hidden)
- `<= 768`: sidebar hidden, mobile tab bar shown

For compact sidebar (`<= 1024`), utility items (`App Store/Billing/Admin/Settings`) must remain visible as icon buttons with sufficient contrast.

## 7) iPad QA Matrix (Required)

Before shipping layout/theme changes, verify at minimum:

- `1024x1366` (iPad Pro portrait)
- `1366x1024` (iPad Pro landscape)
- `834x1194` (iPad Air portrait)
- `768x1024` (iPad classic portrait)

Routes to verify:

- `/dashboard`
- `/apps/finance`
- `/store`
- `/settings`

Checks:

- No horizontal overflow
- No clipped navigation/content
- Utility nav icons visible in compact sidebar
- Theme consistency across all routes
- No console errors

## 8) Implementation Checklist

When adding or editing UI:

1. Use existing tokens before introducing new colors/spacing.
2. Keep interaction targets at least `44x44` for touch contexts.
3. Avoid `transition: all`; use property-specific transitions.
4. Keep loading/feedback visuals consistent with icon system.
5. Re-run iPad matrix when touching shell/sidebar/theme code.

## 9) Anti-Patterns (Do Not Ship)

- Theme logic duplicated in multiple components.
- Route-specific theme hacks.
- Compact sidebar with hidden utility actions.
- Mixing hardcoded hex colors with tokenized surfaces in same component.
- UI changes without screenshot validation at tablet sizes.

## 10) Quick Commands For QA

- Run app: `npm run dev`
- Typecheck: `npm run typecheck`
- Build: `npm run build`

Manual browser QA should include light, dark, and system mode transitions.

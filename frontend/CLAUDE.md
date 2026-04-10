# CLAUDE.md

## Design Docs Usage Guide

When working on frontend UI/UX in this repo, follow this order strictly:

1. Read `DESIGN.md` first.
2. Reuse existing tokens and layout rules from:
   - `src/app/tokens.css`
   - `src/app/components.css`
   - `src/app/layout.css`
3. For theme behavior, only use:
   - `src/lib/theme.ts`
4. Validate responsive behavior with the iPad matrix in `DESIGN.md`.

## Required Checks For UI Changes

- No horizontal overflow on tested breakpoints.
- No clipped sidebar/navigation actions.
- Theme consistency across `/dashboard`, `/apps/*`, `/store`, `/settings`.
- No console errors.

## Theme Rule

Do not hand-roll theme toggling logic in page components.
Always call centralized theme helpers from `src/lib/theme.ts`.

## Documentation Rule

If you change tokens, breakpoints, or theme behavior, update `DESIGN.md` in the same change.

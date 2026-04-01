# Frontend Sub-App Refactor Checklist

> Purpose: refactor existing frontend apps to the shared sub-app protocol
> documented in `docs/PLUGIN_DEVELOPMENT_GUIDE.md` before expanding to new apps.

## Target protocol

Each app under `frontend/src/apps/{app_id}/` should converge to:

```text
frontend/src/apps/{app_id}/
├── manifest.json
├── index.ts
├── AppView.tsx
├── DashboardWidget.tsx
├── api.ts
├── views/
├── widgets/
├── features/
├── components/
└── lib/
```

Required behavior:

- `AppView.tsx` is thin and delegates to `views/`
- `DashboardWidget.tsx` is thin and delegates to `widgets/`
- `widgets/` contains per-widget renderer files, not one large widget switchboard
- `manifest.json` mirrors backend manifest ids and sizes exactly
- feature-specific logic stays inside app-local folders, not `frontend/src/pages/`
- all app-scoped API calls stay inside the app module

## Phase 1: shared protocol and tooling

- [x] Write the protocol into `docs/PLUGIN_DEVELOPMENT_GUIDE.md`
- [x] Update `scripts/create_plugin.py` to scaffold the new frontend layout
- [ ] Update `scripts/validate-manifests.mjs` if new required files or folders change
- [ ] Update related docs that still mention `widgets/index.ts` or `pages/apps/*`

## Phase 2: finance refactor

Current risk:

- `frontend/src/apps/finance/AppView.tsx` is a monolith and mixes modal UI, form UI,
  feature logic, and app-level orchestration in one file.

Checklist:

- [x] Extract app-local reusable UI into `frontend/src/apps/finance/components/`
- [x] Extract wallets feature into `frontend/src/apps/finance/features/wallets/`
- [x] Extract transactions feature into `frontend/src/apps/finance/features/transactions/`
- [x] Extract categories feature into `frontend/src/apps/finance/features/categories/`
- [x] Create `frontend/src/apps/finance/views/FinanceScreen.tsx`
- [x] Reduce `frontend/src/apps/finance/AppView.tsx` to orchestration only
- [x] Keep `frontend/src/apps/finance/DashboardWidget.tsx` as a dispatcher only
- [ ] Verify `finance/manifest.json` still matches backend manifest

## Phase 3: todo refactor

Current risk:

- `frontend/src/apps/todo/AppView.tsx` is smaller but still combines screen layout,
  row rendering, form rendering, and task state logic in one file.

Checklist:

- [x] Extract task row and task form into `frontend/src/apps/todo/components/`
- [x] Extract task list behavior into `frontend/src/apps/todo/features/tasks/`
- [x] Create `frontend/src/apps/todo/views/TodoScreen.tsx`
- [x] Reduce `frontend/src/apps/todo/AppView.tsx` to orchestration only
- [x] Keep `frontend/src/apps/todo/DashboardWidget.tsx` as a dispatcher only
- [ ] Verify `todo/manifest.json` still matches backend manifest

## Phase 4: registry and docs cleanup

- [ ] Confirm `frontend/src/apps/index.ts` remains the only frontend app registry
- [ ] Remove stale docs that mention side-effect widget registration
- [ ] Remove stale docs that mention `frontend/src/pages/apps/*`
- [ ] Document the generator contract after `scripts/create_plugin.py` is updated

## Acceptance checklist

- [ ] `npx tsc --noEmit` passes
- [x] `npm run build` passes
- [ ] `npm run validate:manifests` passes
- [x] `AppView.tsx` in each app is short and orchestration-focused
- [x] `DashboardWidget.tsx` in each app uses widget-id dispatch
- [ ] No frontend app relies on `widgets/index.ts` registration side effects

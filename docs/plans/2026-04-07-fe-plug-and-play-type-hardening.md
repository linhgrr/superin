# FE Plug-and-Play + Subapp Type Hardening (2026-04-07)

## Context
- FE đang theo kiến trúc subapp (`frontend/src/apps/{appId}`) nhưng còn một số coupling/lỗi boundary.
- Type generated từ BE (`openapi-typescript`) đã có request schema, nhưng response schema cho nhiều subapp endpoint vẫn là `unknown`.
- Subapp `api.ts` vẫn phải tự định nghĩa nhiều response type bằng tay.

## Objectives
1. Đảm bảo plug-and-play boundary trên FE vận hành đúng ở runtime.
2. Đảm bảo BE -> OpenAPI -> FE generated type cover tốt hơn cho toàn bộ subapp.
3. Thiết lập cơ chế type facade ổn định để FE không phụ thuộc trực tiếp vào cấu trúc nội bộ file generated.
4. Không phá vỡ flow plugin scaffolding/manifest hiện có.

## Scope
- In-scope:
  - FE discovery/registry boundary.
  - FE shared app typing bridge.
  - FE generated type facade + import migration.
  - BE response schemas/response_model cho các route subapp `todo`, `calendar`, `finance`.
  - Script/codegen adjustments cần thiết để đồng bộ dài hạn.
  - Generate app-local subapp API clients from OpenAPI so FE contract không còn code tay trong `src/apps/{app_id}/api.ts`.
- Out-of-scope (để backlog nếu phát sinh):
  - Refactor UI logic không liên quan boundary/type.
  - Fix toàn bộ platform type errors không liên quan boundary/subapp contract.

## Execution Plan
1. Fix các lỗi boundary nền tảng FE (discovery, shared types bridge, generic app API helper).
2. Bổ sung schema response ở BE cho từng subapp + annotate route `response_model`.
3. Regenerate OpenAPI + TS types.
4. Tạo facade type ổn định cho FE (`frontend/src/types/generated/index.ts`) và migrate import.
5. Generate `frontend/src/apps/{app_id}/api.ts` từ OpenAPI để bỏ contract viết tay trong subapp.
6. Validate bằng `manifests validate`, `codegen`, FE type/build checks; cập nhật checklist.

## TODO Checklist
- [x] Add docs plan file and keep it as source of truth for progress.
- [x] Fix FE app discovery path matching mismatch (`import.meta.glob` keys vs registry regex).
- [x] Add FE shared app type bridge for `frontend/src/apps/*/index.ts` imports.
- [x] Fix generic app API helper (`src/api/apps.ts`) to use current API client exports.
- [x] Define BE response schemas for `todo` subapp endpoints (task/subtask/recurring/summary/common responses).
- [x] Define BE response schemas for `calendar` subapp endpoints (calendar/event/recurring/common responses).
- [x] Define BE response schemas for `finance` subapp endpoints (wallet/category/transaction/analytics/summary/common responses).
- [x] Annotate BE subapp routes with explicit `response_model` (and keep behavior backward-compatible).
- [x] Run `python scripts/superin.py codegen` to refresh `openapi.json` + `frontend/src/types/generated/api.ts`.
- [x] Add stable FE facade exports over generated types (`frontend/src/types/generated/index.ts`).
- [x] Migrate FE imports from `@/types/generated/api` to the new facade.
- [x] Generate subapp `api.ts` files from OpenAPI and remove handwritten contract wrappers.
- [x] Verify subapp `api.ts` files use generated request/response types wherever now available.
- [x] Run `python scripts/superin.py manifests validate` and confirm pass.
- [x] Run FE type/build checks and record remaining issues (if any) with severity.
- [x] Update this checklist with final status and residual TODOs.

## Result
- `frontend/src/types/generated/index.ts` đã là facade ổn định do codegen sinh.
- `frontend/src/apps/{todo,calendar,finance}/api.ts` đã chuyển sang generated files; FE không còn giữ handwritten subapp contract layer.
- FE subapp code đã chuyển sang dùng generated request/response types thay vì tự định nghĩa lại BE contract.
- `python scripts/superin.py manifests validate` pass.
- `frontend` typecheck đã loại bỏ toàn bộ lỗi contract/subapp liên quan hardening này; phần lỗi còn lại nằm ở platform/providers/dashboard cũ, không phải do subapp contract.

## Residual Backlog
- Platform typing backlog còn lại ở `CommandPalette`, `InnerProviders`, `OnboardingProvider`, `icon-resolver`, `swr.ts`, `AppPage`, `DashboardPage`.
- Nếu tiếp tục cleanup toàn repo, nên tách riêng một plan cho platform type debt để không trộn với boundary/codegen hardening của subapp.

## Success Criteria
- FE discovery registers apps correctly without hardcoded app IDs.
- OpenAPI generated types for subapp endpoints are no longer mostly `unknown` for primary response payloads.
- FE imports generated types through one stable module path.
- Existing `todo/calendar/finance` app flows continue to build and run.

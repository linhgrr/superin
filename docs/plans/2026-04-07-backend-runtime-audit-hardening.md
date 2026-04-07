# Backend Runtime Audit Hardening (2026-04-07)

## Context
- Root-agent đã được harden fail-closed cho tool scoping, event streaming sibling branches, và history scoping.
- Audit tiếp theo tập trung vào production runtime của subapps: concurrency, DB invariants, install/access flow, và mọi chỗ backend đang dựa vào check ở application layer thay vì invariant ở DB.
- Mục tiêu là fail-closed, idempotent, và không để race condition tạo ra dữ liệu sai hoặc partial write.

## Objectives
1. Loại bỏ các lost update / partial write trong các flow mutate quan trọng của subapp.
2. Đẩy uniqueness/default invariants xuống MongoDB thay vì chỉ check trong service.
3. Bổ sung regression tests cho các flow đã harden.
4. Ghi rõ rule vào `CLAUDE.md` để lần sau code mới không tái tạo cùng lớp lỗi.
5. Rà lại các drift còn sót giữa docs/tooling/runtime sau khi sửa.

## Scope
- In-scope:
  - `backend/apps/finance/*`
  - `backend/apps/calendar/*`
  - `backend/core/index_contract.py`
  - `backend/core/db.py` nếu cần helper session/transaction
  - `backend/tests/**/*`
  - `CLAUDE.md`
  - Tooling/docs drift phát hiện trực tiếp trong lúc audit runtime
- Out-of-scope:
  - Memory/persistence strategy của agent beyond current root-history path
  - Frontend UI refactor không liên quan runtime/backend invariants
  - Large redesign của install lifecycle nếu không có bằng chứng bug/blocker rõ ràng trong round này

## Execution Plan
1. Ghi lại findings gốc và checklist thực thi.
2. Harden finance bằng Mongo transaction + atomic wallet updates + DB unique invariants.
3. Harden calendar bằng DB unique/default invariants và update flow fail-safe.
4. Thêm regression tests cho fail-closed / duplicate / transaction-sensitive behavior.
5. Cập nhật `CLAUDE.md` bằng rule chuẩn hoá mới về DB invariants và generated/runtime boundaries.
6. Chạy targeted checks, rà thêm drift còn sót, rồi commit theo nhóm fix rõ ràng.

## TODO Checklist
- [x] Add this plan file and treat it as the backend runtime audit source of truth.
- [x] Audit finance mutate flows for lost-update / partial-write risks and document exact root causes in code comments/tests.
- [x] Replace finance wallet balance read-modify-write with atomic DB mutation.
- [x] Wrap finance multi-document mutations in Mongo transactions.
- [x] Add DB-backed uniqueness for finance wallet/category names.
- [x] Ensure finance transaction flows validate referenced category/wallet consistently.
- [x] Fix any unrelated but real finance logic bug uncovered during audit if it shares the same execution path.
- [x] Add DB-backed uniqueness for calendar names and single-default invariant.
- [x] Harden calendar create/update/on_install flows against duplicate/default races.
- [x] Extend index contract/migration tooling for any new plugin indexes that must fail-fast on startup.
- [x] Add regression tests for new invariants and concurrency-sensitive service behavior.
- [x] Update `CLAUDE.md` with precise rules for DB invariants / transactions / generated boundaries.
- [x] Re-check runtime access flow for uninstalled apps and note any remaining gaps.
- [x] Re-check repo tooling/docs for drift exposed by this audit and fix high-value items in the same pass.
- [x] Run targeted tests/checks and record outcomes.
- [ ] Commit final hardening changes with clear scope.

## Findings Applied
- Finance wallet/category names are now enforced by DB-backed per-user unique indexes using normalized `name_key`.
- Finance wallet balance changes now go through atomic DB updates and all multi-document mutate flows run inside Mongo transactions.
- Finance transaction flows now validate referenced category/wallet inside the same transaction and no longer rely on stale in-memory balances.
- Finance `list_transactions()` no longer passes pagination args into date-filter slots by position.
- Calendar names are now enforced by DB-backed per-user unique indexes using normalized `name_key`.
- Calendar default selection is now enforced by a partial unique index so one user cannot have multiple default calendars concurrently.
- Calendar delete flow now promotes another calendar to default when deleting the current default and another calendar still exists.
- Root runtime access for uninstalled apps remains fail-closed: plugin routers require installation, workspace bootstrap filters to installed apps, and root-agent tool scoping now fails closed.
- Local DB cleanup workflow now uses disposable reset semantics (`db reset --yes`) instead of keeping ad hoc migration/backfill commands for stale dev data.

## Residual Note
- `scripts/superin.py` still contains older frontend assumptions outside the runtime/concurrency path. This is tooling drift, not a production runtime integrity bug, so it should be cleaned in a separate pass if that workflow is still active.

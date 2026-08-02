## 1. Migration retry contract

- [x] 1.1 Extend `src/main/migrations/types.ts` with optional `Migration.retryPolicy: "never" | "until-success"`; update `src/main/migrations/runner.ts` so default migrations keep skip-on-any-record behavior, retryable migrations rerun until any success record exists, and `getRequiredMigrationStatus()` returns the last attempt for an ID. Add runner tests for default failed skip, retryable failed replay/append, latest error, success stop, and fresh baseline.

## 2. Cutover validation reuse

- [x] 2.1 Extract the legacy Project → Workspace/Folder completeness checks from `validateWorkspaceCutoverState()` into a migration-safe helper that accepts injected `listLegacyProjects`, `loadWorkspace`, and `loadFolder` dependencies. Preserve ID/name/kind/member/timestamp/health/provenance checks, candidate collision rules, stable issue ordering, and no-write behavior; add focused tests for complete, missing, collision, and malformed targets.

## 3. Settlement planning and cleanup

- [x] 3.1 Extend `src/main/migrations/legacy-project-store.ts` with narrowly scoped, injectable helpers needed by settlement to enumerate/validate legacy records and delete an authorized source/meta idempotently. Implement a pure cleanup-plan builder in `src/main/migrations/scripts/20260804_001_retire-legacy-project-storage.ts` that accepts only persisted `legacyAppDataKey`, rejects unsafe/duplicate provenance before deletion, sorts by Workspace ID, and excludes collision/unowned orphan directories. Cover same-key conflict, absent provenance, unsafe key, `legacyAppDataKey === workspaceId`, and distinct data/meta directory layouts.
- [x] 3.2 Implement the settlement `migrate()` orchestration in `20260804_001_retire-legacy-project-storage.ts`: only reuse the released cutover's exported idempotent entry point when the old cutover has not succeeded; after old success, preserve legitimate mutable Workspace/Folder changes and validate only stable identity/member/provenance invariants. Run global preflight before any delete, then for each plan item delete source, delete same-ID meta, and finally save Workspace meta without `legacyAppDataKey`. Make missing source/meta idempotent, propagate write/delete failures, and add tests for full success, preflight zero-delete, interruption/retry at each step, current Workspace data preservation, and orphan/collision retention.

## 4. Registry and bootstrap gate

- [x] 4.1 Register `WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID` after all existing migrations in `src/main/migrations/scripts/index.ts` with `retryPolicy: "until-success"`, export it through `src/main/migrations/index.ts`, and update `test/main/migrations/scripts-index.spec.ts` to enforce immutable old IDs, filename order, and the settlement retry policy.
- [x] 4.2 Refactor `validateWorkspaceCutoverState()` and `src/main/bootstrap/index.ts` to gate on the settlement ID/latest attempt or a baseline covering it; after settlement success do not enumerate deleted legacy meta. Update runner/bootstrap tests for pending, latest failed, old-cutover-failed + settlement-success, fresh baseline, and confirmation that failure still precedes MCP/IPC/workflow/window/warmup side effects.

## 5. Diagnostics and documentation

- [x] 5.1 Update `src/main/bootstrap/workspace-upgrade-failure.ts` so the native blocking dialog names the settlement ID, latest reason/log path, states that unowned data is not deleted and the settlement retries on next launch, while retaining only “打开日志目录” and “退出 FylloCode”. Update `test/main/bootstrap/workspace-upgrade-failure.spec.ts` for direct exit, log-open success/failure, dialog failure, and retry wording.
- [x] 5.2 Through the guideline maintenance workflow, update `guidelines/DataMigrations.md` with opt-in retry semantics, latest-attempt lookup, settlement ordering, provenance-only deletion, and post-success gate behavior. Replace Phase 8 / §23 temporary retirement inventory in `references/designs/multi-root-workspace/README.md` with `retire-legacy-project-storage` proposal and `legacy-project-storage-retirement` / `workspace-storage-cutover` spec links.

## 6. Verification

- [x] 6.1 Run focused migration, legacy-store, bootstrap and Workspace cleanup Vitest suites; run `pnpm typecheck`, `pnpm lint`, affected-file Prettier check, and `git diff --check`. Record results here, without running full `pnpm build` or starting `pnpm dev`.

  Validation: 12 focused migration/bootstrap/Workspace-cleanup test files and 78 tests passed. `pnpm typecheck`, `pnpm lint`, tracked/untracked affected-file Prettier checks, and `git diff --check` passed. Full `pnpm build` and `pnpm dev` were not run.

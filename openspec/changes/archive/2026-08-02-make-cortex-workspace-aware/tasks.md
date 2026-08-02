## 1. Shared scope and storage contracts

- [x] 1.1 Update `src/shared/types/knowledge.ts` and knowledge schemas/serializers so file/package anchors require `folderId`, commit sources require `folderId`, and lineage sources use `ProposalRef` or Folder-qualified commit evidence while URL/session variants remain Workspace-only; update `src/mcp-servers/fyllo-cortex/src/utils/knowledge.ts` DTO normalization and `test/mcp-servers/fyllo-cortex/knowledge-utils.spec.ts` to prove same relative paths in two Folders never cross-validate.
- [x] 1.2 Replace the Workspace `LineageIndex` contract in `src/shared/types/lineage.ts` and `src/main/domain/insight/lineage/{index-derive,subject,projection}.ts` with owner-qualified v2 proposal/commit keys, add `RepositoryLineageRelation`/`RepositoryLineageIndex` plus stable ProposalRef/commit key helpers, and extend domain tests for cross-Folder same-name proposals and missing-owner rejection.
- [x] 1.3 Add `folderLineageDir(folderId)` / reverse-index path helpers to `src/main/infra/storage/workspace-paths.ts` and implement `src/main/infra/storage/repository-lineage-store.ts`: schema normalization, read API, origin/reference mutation, full read-modify-write per-file queue, unique temp + atomic rename, idempotent reference and origin conflict; focused infra tests must cover concurrent appends, replay, conflict and write failure without partial JSON.

## 2. Upgrade migration

- [x] 2.1 Add and register `src/main/migrations/scripts/20260803_001_cortex-workspace-scope.ts` without modifying the released cutover migration: for a uniquely provable Folder, preserve and rewrite legacy knowledge markdown to add owner to file/package anchors and commit sources; scan Workspace subjects in stable order, rebuild v2 Workspace indexes, populate only provable Folder proposal/commit origins, preserve ambiguous source files, and persist per-Workspace warnings for missing owner/corrupt subject/conflict; add migration fixtures for knowledge/lineage conversion, idempotent replay, partial invalid data, conflict and write failure, plus the scripts-index check.

## 3. Cortex guidelines and reminder scope

- [x] 3.1 Refactor `src/mcp-servers/fyllo-cortex/src/tools/guidelines.ts` to accept `folderId?`, resolve owner via shared Workspace resolver, keep `path` repository-relative, return resolved Folder state, and reject ownerless multi-root calls without scanning; update guideline tool instructions/README and MCP focused tests for primary, secondary, unauthorized, traversal and single-Folder compatibility.
- [x] 3.2 Refactor `src/main/services/session/chat/system-reminder/providers/guidelines.ts` and reminder context assembly so Chat scans every validated snapshot Folder into owner groups with per-Folder warnings, while Apply/Archive scan only the fixed owner worktree; update system-reminder tests for duplicate relative paths, missing/error Folder isolation, safe escaping and owner-only Apply/Archive output.

## 4. Workspace knowledge with Folder evidence

- [x] 4.1 Refactor `src/mcp-servers/fyllo-cortex/src/tools/knowledge.ts`, `utils/knowledge.ts`, main `src/main/infra/storage/knowledge.ts`, and reminder/browser callers to pass Workspace-owned knowledge root separately from authorized Folder evidence roots; validate every file/package/source Folder through the shared descriptor or Session snapshot, return unknown for missing/unauthorized owners without primary fallback, and update authoring instructions plus MCP/main focused tests.

## 5. Dual-scope lineage writers and readers

- [x] 5.1 Update `src/main/infra/storage/lineage-store.ts` and `src/main/services/insight/lineage/lineage-service.ts` to read/write Workspace index v2, require ProposalRef for proposal/commit operations, and expose repository origin/reference methods backed by `repository-lineage-store.ts`; preserve subject-first durability and return explicit reverse-index failure/conflict states, with service/store tests.
- [x] 5.2 Wire explicit relations into lifecycle boundaries: `mcp-event-consumer.ts` records proposal origin after validating create events; Apply/Archive run start records a reference only for a different/current explicit subject continuing an existing ProposalRef; archive/commit discovery records commit origin using the fixed owner; passive browser/trace/knowledge reads do not mutate indexes. Extend consumer, apply/archive and proposal-status/overview focused tests for idempotency, second-origin conflict and no passive side effects.
- [x] 5.3 Refactor `src/mcp-servers/fyllo-cortex/src/tools/lineage.ts` and `utils/lineage-reader.ts` so all trace modes require `folderId`, proposal/commit queries use that Folder reverse index, file trace validates optional registered worktree and canonical relative path, and responses include resolved target, unique origin/null warnings and all references; only hydrate subjects for the active descriptor Workspace. Update tool schema/README and Cortex tests for main/linked target, escape rejection, cross-Workspace relation redaction and multi-reference results.

## 6. Lineage Browser owner identity

- [x] 6.1 Update lineage shared IPC/preload/renderer contracts, `src/main/services/insight/lineage/browser.ts`, insight lineage store/page and proposal detail integration so current Workspace subjects remain the only list source and every proposal node uses full `ProposalRef`, owner Folder metadata and composite keys; tests must cover cross-Folder same-name links, Workspace switch late responses, correct detail owner and absence of other-Workspace subject enrichment.

## 7. Documentation and verification

- [x] 7.1 Replace this proposal's §23.7 temporary inventory entries in `references/designs/multi-root-workspace/README.md` with links to `fyllo-cortex-guidelines`, `fyllo-cortex-knowledge`, `repository-lineage`, `lineage-browser`, and `mcp-workspace-authorization`; update `guidelines/MainProcess.md`, `guidelines/DataMigrations.md`, and `guidelines/RendererProcess.md` through the guideline maintenance workflow with the adopted Folder evidence, dual-scope lineage and ProposalRef browser boundaries.
- [x] 7.2 Run affected Cortex/main/migration/preload/renderer focused Vitest, `pnpm typecheck`, `pnpm lint`, Prettier check and `git diff --check`; fix failures and record results. Do not run full `pnpm build` and do not start `pnpm dev`.
  - Validation: 24 focused main/Cortex/migration/preload/shared files (218 tests) and 2 renderer files (9 tests) passed; `pnpm typecheck`, `pnpm lint`, affected-file Prettier check, and `git diff --check` passed.

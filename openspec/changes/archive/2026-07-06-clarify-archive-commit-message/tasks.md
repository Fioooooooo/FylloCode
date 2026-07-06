## 1. Prompt Contract Updates

- [x] 1.1 Update `archiveChangeInputSchema` in `src/mcp-servers/fyllo-specs/src/tools/archive-change.ts`: revise the `commitMessage` `.describe(...)` text so the first line is `type(scope): summary`, the summary is based on the current proposal, modified files, and delivered change, and archive/sync-only subjects are not recommended.
- [x] 1.2 Update `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md`: change the commit-message guardrail so the commit subject describes the proposal's delivered change; allow archive/sync facts only as optional body bullets or final archive summary facts; keep existing archive workflow, conflict, recovery, and reporting instructions intact.
- [x] 1.3 Update `src/main/services/chat/system-reminder/templates/archive.txt`: revise the Commit Rules and critical constraints so `type(scope): summary` remains required, the subject describes the proposal delivery, and archive/sync details are limited to optional body bullets or final reporting.

## 2. Test Fixture Updates

- [x] 2.1 Update `test/mcp-servers/fyllo-specs/tools.test.ts` success-path `commitMessage` examples at the `archive-change successfully archives a change with confirm: true` and `archive-change syncs delta specs before archiving` cases so they use proposal-delivery subjects instead of `chore(specs): archive ...`.
- [x] 2.2 Update `test/mcp-servers/fyllo-specs/runtime.test.ts` archive workspace finalization fixtures so their `commitMessage` values use proposal-delivery subjects instead of `chore(specs): archive sample change`.
- [x] 2.3 Update or add assertions in `test/main/services/chat/system-reminder/archive.spec.ts` only if needed to cover the new Archive stage wording; do not add runtime semantic rejection tests because this proposal explicitly keeps validation format-only.

## 3. Validation

- [x] 3.1 Run `pnpm exec vitest run --project main test/mcp-servers/fyllo-specs/tools.test.ts test/mcp-servers/fyllo-specs/runtime.test.ts test/main/services/chat/system-reminder/archive.spec.ts` and ensure the targeted tests pass.
- [x] 3.2 Run `pnpm lint` to ensure prompt/template/test edits satisfy project linting.
- [x] 3.3 Verify manually that no success-path archive fixture in `test/mcp-servers/fyllo-specs` still uses `chore(specs): archive ...` as a recommended `commitMessage`.

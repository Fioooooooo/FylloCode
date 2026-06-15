## 1. Rename MCP Server Source and Tests

- [x] 1.1 Rename `src/mcp-servers/fyllo-skills/` to `src/mcp-servers/fyllo-cortex/`, preserving the existing `src/index.ts`, `src/server.ts`, `src/tools/**`, `src/utils/**`, `types.d.ts`, `tsconfig.json`, and server `CHANGELOG.md` structure.
- [x] 1.2 In `src/mcp-servers/fyllo-cortex/src/server.ts`, change `new McpServer({ name })` from `"fyllo-skills"` to `"fyllo-cortex"` and update imports from `FYLLO_SKILLS_SERVER_VERSION` to a `FYLLO_CORTEX_SERVER_VERSION` export in `src/mcp-servers/fyllo-cortex/src/version.ts`.
- [x] 1.3 Update `src/mcp-servers/fyllo-cortex/tsconfig.json` so its test include points to `../../../test/mcp-servers/fyllo-cortex/**/*` and contains no `fyllo-skills` string.
- [x] 1.4 Rename `test/mcp-servers/fyllo-skills/` to `test/mcp-servers/fyllo-cortex/` and update all imports from `../../../src/mcp-servers/fyllo-skills/...` to `../../../src/mcp-servers/fyllo-cortex/...`.
- [x] 1.5 Update MCP server tests in `test/mcp-servers/fyllo-cortex/prompts.test.ts` and `test/mcp-servers/fyllo-cortex/tools.test.ts` so test names, temporary directory prefixes, `McpServer` test names, and `Client` test names use `fyllo-cortex`.
- [x] 1.6 Keep `guidelines` tool behavior unchanged: `mode=read` still returns JSON guideline metadata, `mode=write` still returns `<tool_instruction>`, and no test expectation should change except names/paths.

## 2. Update Bundled MCP Build and Runtime Registry

- [x] 2.1 Update `scripts/build-mcp-servers.mjs` so the explicit server list contains `{ name: "fyllo-cortex", external: [] }` instead of `fyllo-skills`, and build output becomes `out/mcp-servers/fyllo-cortex/index.js`.
- [x] 2.2 Update `src/main/infra/mcp/bundled-mcp-servers.ts`: change `BundledMcpServerName` to `"fyllo-specs" | "fyllo-cortex"`, change the second registry entry name to `"fyllo-cortex"`, and keep `FYLLO_OPENSPEC_CLI_PATH` only on `fyllo-specs`.
- [x] 2.3 Update `test/main/infra/mcp/bundled-mcp-servers.test.ts` so stable order assertions are `["fyllo-specs", "fyllo-cortex"]`, dev/prod path assertions point to `mcp-servers/fyllo-cortex/index.js`, and OpenSpec env absence is asserted on the cortex spec.
- [x] 2.4 Update `vitest.config.mts` coverage/exclude entries from `src/mcp-servers/fyllo-skills` to `src/mcp-servers/fyllo-cortex`.
- [x] 2.5 Run `pnpm build:mcp-servers` and verify `out/mcp-servers/fyllo-cortex/index.js` exists; do not hand-edit files under `out/`.

## 3. Update ACP and System Reminder Surfaces

- [x] 3.1 Update `src/main/services/chat/system-reminder/templates/chat.txt`, `apply.txt`, and `archive.txt` so guidelines routing uses `mcp__fyllo_cortex__guidelines` and refers to `fyllo-cortex.guidelines` where prose names the bundled tool.
- [x] 3.2 Update `test/main/services/chat/system-reminder/archive.spec.ts` and `test/main/services/chat/system-reminder/shared.spec.ts` to assert the new `mcp__fyllo_cortex__guidelines` function name and to reject `mcp__fyllo_skills__guidelines`.
- [x] 3.3 Update `test/main/services/chat/acp-mapper.spec.ts` fixtures from `server: "fyllo-skills"` / `"Tool: fyllo-skills/guidelines"` to `server: "fyllo-cortex"` / `"Tool: fyllo-cortex/guidelines"` while preserving the mapper behavior being tested.
- [x] 3.4 Update the explanatory comment in `src/main/services/chat/acp-mapper.ts` so examples use `fyllo-cortex` instead of `fyllo-skills`.
- [x] 3.5 Search `src/main/**` and `test/main/**` for `fyllo-skills`; every runtime/test reference outside this change's OpenSpec artifacts must be replaced with `fyllo-cortex`.

## 4. Update Product Docs, Guidelines, and References

- [x] 4.1 Update `README.md` and `README.en.md` so diagrams, feature tables, workflow descriptions, and terminology refer to `fyllo-cortex` instead of `fyllo-skills`.
- [x] 4.2 Rename `docs/reference/fyllo-skills.md` to `docs/reference/fyllo-cortex.md`, update its heading/body to describe `fyllo-cortex`, and update `docs/.vitepress/config.mts` navigation from `/reference/fyllo-skills` to `/reference/fyllo-cortex`.
- [x] 4.3 Update `docs/guide/getting-started.md`, `docs/guide/index.md`, `docs/assets/diagrams/workflow.svg`, and `docs/assets/diagrams/workflow-zh.svg` so visible text references `fyllo-cortex`.
- [x] 4.4 Update repository guidelines: `guidelines/Architecture.md`, `guidelines/Build.md`, and `guidelines/Testing.md` examples, verification notes, and source/test path references from `fyllo-skills` to `fyllo-cortex`.
- [x] 4.5 Update `CHANGELOG.md`, `CHANGELOG.en.md`, `src/mcp-servers/fyllo-cortex/CHANGELOG.md`, and any docs/reference files under `references/**` that contain `fyllo-skills`, preserving surrounding historical context while using the new name.
- [x] 4.6 Review archived OpenSpec change artifacts under `openspec/changes/archive/**` and replace `fyllo-skills` with `fyllo-cortex` where they are treated as searchable project documentation or examples; the current change directory may still mention the old name because it documents the rename.

## 5. Align OpenSpec Current Contract Through This Change

- [x] 5.1 Use delta specs for existing capability content updates, but delete current `openspec/specs/fyllo-skills-mcp/spec.md` directly because OpenSpec archive cannot apply a whole-capability removal as an empty rebuilt spec.
- [x] 5.2 Confirm the delta specs cover all current capabilities that mention the old name and can be updated through archive sync: `bundled-mcp-servers`, `fyllo-cortex-mcp`, `acp-chat-backend`, `system-reminder-injection`, and `desktop-packaging`; handle old `fyllo-skills-mcp` by current spec deletion.
- [x] 5.3 Before Archive, verify current code/docs no longer rely on `fyllo-skills`; Archive will sync current spec content updates from this change's delta specs and the git commit will include the old capability spec deletion.

## 6. Verification

- [x] 6.1 Run `pnpm build:mcp-servers`.
- [x] 6.2 Run `pnpm vitest run test/mcp-servers/fyllo-cortex/*.test.ts test/main/infra/mcp/bundled-mcp-servers.test.ts test/main/services/chat/acp-mapper.spec.ts test/main/services/chat/system-reminder/*.spec.ts`.
- [x] 6.3 Run `pnpm typecheck`.
- [x] 6.4 Run `pnpm lint`.
- [x] 6.5 Run `git grep -n "fyllo-skills" -- .` and review every match. Before Archive, allowed matches are limited to this change's proposal artifacts and current `openspec/specs/**` entries that Archive will update; all active code, tests, docs, guidelines, README, CHANGELOG, and references must use `fyllo-cortex`.

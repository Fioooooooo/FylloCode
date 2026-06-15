## 1. Generalize Bundled MCP Infrastructure

- [x] 1.1 Update `scripts/build-mcp-servers.mjs` to build an explicit list containing `fyllo-specs` and `fyllo-cortex` into `out/mcp-servers/<server-name>/index.js`.
- [x] 1.2 Preserve current esbuild shared settings in `scripts/build-mcp-servers.mjs`, including `.md` text loader, `@shared` / `@main` aliases, CJS output, Node target, and `import.meta.url` workaround.
- [x] 1.3 Keep `@fission-ai/openspec` external only for the `fyllo-specs` build entry; do not add OpenSpec-specific externals for `fyllo-cortex`.
- [x] 1.4 Refactor `electron/main/infra/mcp/bundled-mcp-servers.ts` from `resolveBundlePath()` singleton logic to an explicit registry for `fyllo-specs` and `fyllo-cortex`.
- [x] 1.5 Ensure `getBundledMcpServers({ projectPath })` returns stable order: `fyllo-specs` first, `fyllo-cortex` second.
- [x] 1.6 Ensure every returned `McpServerSpec.env` contains `ELECTRON_RUN_AS_NODE`, `FYLLO_PROJECT_PATH`, and `FYLLO_MCP_TELEMETRY`.
- [x] 1.7 Ensure only the `fyllo-specs` env contains `FYLLO_OPENSPEC_CLI_PATH`; `fyllo-cortex` must not receive it.
- [x] 1.8 Preserve `FYLLO_DISABLE_BUNDLED_MCP=1` behavior so `getBundledMcpServers()` returns `[]` for all bundled servers.

## 2. Add fyllo-cortex MCP Server

- [x] 2.1 Create `mcp-servers/fyllo-cortex/tsconfig.json` matching the existing bundled server TypeScript setup where applicable.
- [x] 2.2 Create `mcp-servers/fyllo-cortex/src/index.ts` with the same signal/abort startup pattern used by `mcp-servers/fyllo-specs/src/index.ts`.
- [x] 2.3 Create `mcp-servers/fyllo-cortex/src/server.ts` that starts `new McpServer({ name: "fyllo-cortex", version })`, registers tools, and connects to `StdioServerTransport`.
- [x] 2.4 Create `mcp-servers/fyllo-cortex/src/version.ts` with an exported `FYLLO_SKILLS_SERVER_VERSION`.
- [x] 2.5 Create `mcp-servers/fyllo-cortex/src/tools/index.ts` and `mcp-servers/fyllo-cortex/src/tools/guidelines.ts`.
- [x] 2.6 Register exactly one tool named `guidelines`; its schema must accept no required or optional user-facing parameters.
- [x] 2.7 Make the `guidelines` tool return a single text content item containing `<tool_instruction>...</tool_instruction>` and no `<state>` block.
- [x] 2.8 Create `mcp-servers/fyllo-cortex/src/tools/instructions/guidelines.md` and load it through a prompt loader instead of embedding the instruction body in TypeScript.
- [x] 2.9 Ensure the `guidelines.md` instruction covers only the repository guidelines file contract, focused root `AGENTS.md` guidelines index section, recommended guideline files, per-file document format, topic-specific checklists, authoring rules, maintenance triggers, and conflict handling.
- [x] 2.10 Ensure `guidelines.md` does not mention Chat, Proposal, Apply, Archive, OpenSpec, worktrees, commits, archive, `mcp__fyllo_specs__*`, or Fyllo proposal tasks.

## 3. Update System Reminder Routing

- [x] 3.1 Update `electron/main/services/chat/system-reminder/templates/chat.txt` to mention `fyllo-cortex.guidelines` as the bundled source for project guidelines file contract and maintenance rules.
- [x] 3.2 In `chat.txt`, add concise routing that before creating proposals for code, behavior, architecture, testing, workflow, or convention changes, the agent should consider whether local guidelines need creation or updates.
- [x] 3.3 Update `electron/main/services/chat/system-reminder/templates/apply.txt` to mention `fyllo-cortex.guidelines` and require reading applicable local repository guidelines before editing code.
- [x] 3.4 In `apply.txt`, add concise routing that missing, stale, or repository-inconsistent guidelines discovered during implementation should be updated as part of the same change.
- [x] 3.5 Update `electron/main/services/chat/system-reminder/templates/archive.txt` to mention `fyllo-cortex.guidelines` and require checking whether the completed change should have updated local guidelines.
- [x] 3.6 Keep detailed guidelines document templates and authoring rules out of all system-reminder templates.

## 4. Tests

- [x] 4.1 Update `electron/main/__tests__/infra/mcp/bundled-mcp-servers.test.ts` to assert `getBundledMcpServers()` returns both `fyllo-specs` and `fyllo-cortex` in stable order.
- [x] 4.2 Extend bundled MCP tests to assert both specs point to `out/mcp-servers/<name>/index.js` in dev mode.
- [x] 4.3 Extend bundled MCP tests to assert both specs point to unpacked `mcp-servers/<name>/index.js` paths in production mode.
- [x] 4.4 Extend bundled MCP tests to assert common env variables exist on both specs and `FYLLO_OPENSPEC_CLI_PATH` exists only on `fyllo-specs`.
- [x] 4.5 Add `mcp-servers/fyllo-cortex/__tests__/tools.test.ts` covering `tools/list` and a successful `guidelines` call.
- [x] 4.6 Add `mcp-servers/fyllo-cortex/__tests__/prompts.test.ts` or equivalent coverage verifying `guidelines.md` exists and the returned instruction contains `<tool_instruction>` but not `<state>`.
- [x] 4.7 Update system-reminder tests under `electron/main/__tests__/services/chat/system-reminder/` to verify chat/apply/archive reminders mention `fyllo-cortex.guidelines`.
- [x] 4.8 Add reminder tests confirming system-reminders do not include detailed guideline document templates.
- [x] 4.9 Update `vitest.config.mts` so default `pnpm test` and coverage include `mcp-servers/fyllo-cortex`.

## 5. Verification

- [x] 5.1 Run `pnpm build:mcp-servers` and confirm both `out/mcp-servers/fyllo-specs/index.js` and `out/mcp-servers/fyllo-cortex/index.js` are generated.
- [x] 5.2 Run focused MCP tests for `mcp-servers/fyllo-cortex`.
- [x] 5.3 Run focused main-process bundled MCP tests.
- [x] 5.4 Run focused system-reminder tests.
- [x] 5.5 Run `pnpm typecheck`.
- [x] 5.6 Run `pnpm test` if the focused tests and typecheck pass.

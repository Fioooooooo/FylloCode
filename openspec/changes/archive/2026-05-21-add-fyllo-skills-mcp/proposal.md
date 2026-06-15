## Why

FylloCode currently bundles only `fyllo-specs`, and both the build script and main-process MCP registration assume a single bundled MCP server. To provide project-level guidelines support without expanding `fyllo-specs` or bloating system-reminders, FylloCode needs a separate `fyllo-cortex` MCP server with a narrowly scoped `guidelines` tool.

## What Changes

- Add a new bundled MCP server named `fyllo-cortex` under `mcp-servers/fyllo-cortex/`.
- Add a single no-argument `guidelines` tool to `fyllo-cortex`.
- Make `guidelines` return only a `<tool_instruction>` block containing the project guidelines file contract and maintenance rules.
- Keep the `guidelines` instruction atomic: it must not mention Chat / Proposal / Apply / Archive, OpenSpec, worktrees, commits, or Fyllo stage workflows.
- Update the system-reminder templates only with lightweight routing text that tells agents the `fyllo-cortex.guidelines` tool exists and when Fyllo stages expect it to be used.
- Generalize bundled MCP infrastructure from the hard-coded `fyllo-specs` singleton to an explicit multi-server registry containing `fyllo-specs` and `fyllo-cortex`.
- Generalize `scripts/build-mcp-servers.mjs` to build all registered bundled MCP servers into `out/mcp-servers/<server-name>/index.js`.

## Capabilities

### New Capabilities

- `fyllo-cortex-mcp`: Defines the `fyllo-cortex` bundled MCP server, its `guidelines` tool, prompt file contract, and atomic instruction boundaries.

### Modified Capabilities

- `bundled-mcp-servers`: Change the bundled MCP distribution and startup contract from a single `fyllo-specs` server to an explicit multi-server registry that includes `fyllo-specs` and `fyllo-cortex`.
- `system-reminder-injection`: Add lightweight stage-level routing for the `fyllo-cortex.guidelines` tool while keeping detailed guidelines content out of system-reminders.
- `acp-chat-backend`: Update ACP session expectations so bundled MCP injection includes both `fyllo-specs` and `fyllo-cortex` when bundled MCP is enabled.

## Impact

- `mcp-servers/fyllo-cortex/**` new stdio MCP server source, prompts, and tests.
- `scripts/build-mcp-servers.mjs` changes from single-server build logic to explicit multi-server build logic.
- `electron/main/infra/mcp/bundled-mcp-servers.ts` changes from a hard-coded `fyllo-specs` path/spec to a registry-driven implementation.
- `electron/main/__tests__/infra/mcp/bundled-mcp-servers.test.ts` and MCP server tests need updated expectations.
- `electron/main/services/chat/system-reminder/templates/{chat,apply,archive}.txt` get concise routing additions only.

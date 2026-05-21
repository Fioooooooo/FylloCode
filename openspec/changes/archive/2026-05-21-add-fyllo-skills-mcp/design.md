## Context

FylloCode binds bundled MCP servers into ACP sessions through `getBundledMcpServers({ projectPath })`. The current implementation and tests assume only `fyllo-specs`, while `scripts/build-mcp-servers.mjs` also builds only that server. The new project-guidelines capability should not be added to `fyllo-specs` because `fyllo-specs` is scoped to OpenSpec lifecycle tools.

The target shape is a separate `fyllo-skills` stdio MCP server that exposes one atomic `guidelines` skill. Fyllo stage prompts may route agents to this tool, but the tool instruction itself must stay independent of Fyllo stage workflow concepts.

## Goals / Non-Goals

**Goals:**

- Add a bundled `fyllo-skills` MCP server with one no-argument `guidelines` tool.
- Keep the `guidelines` tool as an instruction-only tool; it does not inspect the repository, mutate files, or return project state.
- Generalize bundled MCP build and startup logic to an explicit multi-server registry.
- Keep `fyllo-specs` unchanged in purpose and tool surface.
- Add concise system-reminder routing so agents know the guidelines tool exists and stage prompts can require it at the right time.

**Non-Goals:**

- Do not build a generic skills marketplace.
- Do not add parameterized guidelines modes in the first version.
- Do not auto-scan repositories or generate guidelines inside the MCP server.
- Do not persist guidelines state in FylloCode app data.
- Do not move OpenSpec tools from `fyllo-specs`.

## Decisions

### Decision: Use a separate `fyllo-skills` MCP server

`fyllo-skills` will live under `mcp-servers/fyllo-skills/` with its own `src/index.ts`, `src/server.ts`, `src/tools/`, `src/tools/instructions/`, `version.ts`, `tsconfig.json`, and tests.

Rationale: `fyllo-specs` has a precise OpenSpec lifecycle contract. Adding guidelines behavior there would expand its responsibility and make future skill additions harder to bound.

Alternative considered: Add `guidelines` to `fyllo-specs`. Rejected because project guidelines are not OpenSpec artifacts and should not couple the skills surface to OpenSpec runtime state.

### Decision: `guidelines` is no-argument and instruction-only

The first `fyllo-skills` tool will register exactly one tool named `guidelines`. It accepts no input schema fields and returns a single text content item containing `<tool_instruction>...</tool_instruction>`.

The instruction defines:

- project guidelines purpose
- repository file contract (`AGENTS.md`, `guidelines/*.md`)
- guideline document format
- authoring rules
- maintenance triggers
- conflict handling

It must not mention Chat, Proposal, Apply, Archive, OpenSpec, worktrees, commits, or Fyllo stage workflow. Stage-specific orchestration belongs in system-reminder templates.

Alternative considered: Add `mode` parameters such as `discover`, `author`, or `archive-check`. Rejected for the first version because the user's desired abstraction is an atomic file-contract skill, with stage routing handled elsewhere.

### Decision: Use explicit bundled MCP registry instead of directory scanning

`electron/main/infra/mcp/bundled-mcp-servers.ts` should define an explicit registry containing `fyllo-specs` and `fyllo-skills`. Each entry provides the server name and optional env factory.

`getBundledMcpServers({ projectPath })` returns one `McpServerSpec` per registry entry unless `FYLLO_DISABLE_BUNDLED_MCP=1`.

Rationale: Explicit registration prevents accidental expansion when directories are added under `mcp-servers/`, and makes environment differences visible.

Alternative considered: Auto-discover every `mcp-servers/*/src/index.ts`. Rejected because it weakens product control and makes it easier for bundled MCP surface area to grow unintentionally.

### Decision: Generalize build script using the same explicit registry idea

`scripts/build-mcp-servers.mjs` should build a hard-coded list of bundled server names into `out/mcp-servers/<name>/index.js`.

Shared build options:

- bundle with esbuild
- `platform: "node"`
- `format: "cjs"`
- `target: "node20"`
- `.md` loader as `text`
- aliases for `@shared` and `@main`
- current `import.meta.url` banner/define workaround

`fyllo-specs` keeps `external: ["@fission-ai/openspec"]`. `fyllo-skills` should not require OpenSpec-specific externals.

### Decision: Keep env common, add OpenSpec env only to `fyllo-specs`

Both bundled servers receive:

- `ELECTRON_RUN_AS_NODE: "1"`
- `FYLLO_PROJECT_PATH: opts.projectPath`
- `FYLLO_MCP_TELEMETRY: "0"`

Only `fyllo-specs` receives `FYLLO_OPENSPEC_CLI_PATH`.

Rationale: `fyllo-skills` does not invoke OpenSpec and should not receive unrelated env.

### Decision: System-reminder does only lightweight routing

The chat/apply/archive system-reminder templates should mention the existence of `fyllo-skills.guidelines` and stage-level expectations for when to use it. They must not embed the full guidelines file contract or duplicate the guidelines tool instruction.

Rationale: This keeps repeated session reminders small and leaves the maintainable guidelines content in one prompt file.

## Risks / Trade-offs

- **Risk: Agent forgets to call `guidelines`.** Mitigation: add explicit but concise routing text to stage reminders, and cover it with reminder template tests.
- **Risk: `fyllo-skills` becomes a dumping ground for unrelated tools.** Mitigation: spec the first server as registering only `guidelines`; future tools require explicit spec changes.
- **Risk: Build registry and runtime registry drift.** Mitigation: keep both lists short and covered by tests that check both `fyllo-specs` and `fyllo-skills` output/registration.
- **Risk: Instruction grows too large over time.** Mitigation: keep the instruction atomic and forbid workflow-specific content.

## ADDED Requirements

### Requirement: fyllo-cortex MCP server registers only the guidelines tool

`fyllo-cortex` MCP server SHALL be implemented as a bundled stdio MCP server under `mcp-servers/fyllo-cortex/`. It SHALL register exactly one tool named `guidelines`.

The `guidelines` tool SHALL be a no-argument tool. Its input schema SHALL NOT require or accept project-specific parameters such as `targetPath`, `mode`, `changeName`, or `includeInstruction`.

#### Scenario: tool list contains only guidelines

- **WHEN** MCP client calls `tools/list` on `fyllo-cortex`
- **THEN** the returned tool list contains exactly one tool
- **AND** that tool name is `guidelines`

#### Scenario: guidelines accepts no arguments

- **WHEN** MCP client calls `guidelines` with an empty input object
- **THEN** the call succeeds
- **AND** the tool does not require `targetPath`, `mode`, `changeName`, or `includeInstruction`

### Requirement: guidelines tool returns atomic tool instruction only

The `guidelines` tool SHALL return `content: [{ type: "text", text }]`, where `text` contains a `<tool_instruction>...</tool_instruction>` block.

The response SHALL NOT include a `<state>` block. The tool SHALL NOT inspect repository files, calculate repository state, mutate files, or return discovery results. Repository inspection, file creation, and file updates SHALL be performed by the calling agent according to the returned instruction.

#### Scenario: response contains only tool instruction

- **WHEN** MCP client calls `guidelines`
- **THEN** response `content[0].type === "text"`
- **AND** response `content[0].text` contains `<tool_instruction>`
- **AND** response `content[0].text` contains `</tool_instruction>`
- **AND** response `content[0].text` does not contain `<state>`

### Requirement: guidelines prompt is maintained as a markdown file

The `guidelines` tool instruction body SHALL be maintained in `mcp-servers/fyllo-cortex/src/tools/instructions/guidelines.md`. TypeScript code SHALL NOT inline the instruction body as a long string literal. The MCP server implementation SHALL load the markdown prompt through a small loader so esbuild can inline it with the existing `.md` text loader.

#### Scenario: prompt file exists

- **WHEN** checking `mcp-servers/fyllo-cortex/src/tools/instructions/`
- **THEN** `guidelines.md` exists

#### Scenario: instruction body is not embedded in tool code

- **WHEN** searching TypeScript files under `mcp-servers/fyllo-cortex/src/`
- **THEN** project guidelines instruction prose is not duplicated as long string literals in tool registration code
- **AND** the `guidelines` tool uses the markdown prompt loader to produce its response

### Requirement: guidelines instruction defines only project guideline contract

The `guidelines.md` instruction SHALL define the project guidelines file contract and maintenance rules. It SHALL cover:

- root `AGENTS.md` as the agent-facing repository entry point
- `guidelines/*.md` as detailed topic documents
- a focused `Project Guidelines Index` section for root `AGENTS.md` that agents add only when local guideline links are missing or stale
- a recommended `guidelines/*.md` taxonomy for common repository surfaces such as architecture, code style, testing, data models, APIs, IPC, frontend, backend, build, security, dependencies, workflow, and domain rules
- guideline document format using stable sections and `MUST` / `SHOULD` / `MAY` normative terms
- topic-specific content checklists for common guideline files
- authoring rules based on repository evidence
- maintenance triggers for updating guidelines when project conventions change
- conflict handling when local guidelines disagree with higher-priority instructions or observed repository facts

The instruction SHALL NOT mention Fyllo stage names or workflows, including Chat, Proposal, Apply, Archive, OpenSpec, worktrees, commits, archive, `mcp__fyllo_specs__*`, or Fyllo proposal tasks. Stage-specific orchestration belongs in system-reminder templates, not in the `guidelines` tool instruction.

#### Scenario: instruction includes file contract

- **WHEN** MCP client calls `guidelines`
- **THEN** returned instruction mentions root `AGENTS.md`
- **AND** returned instruction mentions `guidelines/`
- **AND** returned instruction describes that repository-owned guidelines are maintained in the user's project

#### Scenario: instruction includes reusable guideline index and document templates

- **WHEN** MCP client calls `guidelines`
- **THEN** returned instruction contains an `AGENTS.md` guidelines index section
- **AND** returned instruction tells agents not to generate or replace a full `AGENTS.md` document from this instruction
- **AND** returned instruction contains a recommended guideline files section
- **AND** returned instruction contains topic-specific content requirements
- **AND** returned instruction mentions `guidelines/Architecture.md`, `guidelines/CodeStyle.md`, `guidelines/Testing.md`, and `guidelines/DataModel.md`

#### Scenario: instruction remains workflow-agnostic

- **WHEN** MCP client calls `guidelines`
- **THEN** returned instruction does not contain `Chat`
- **AND** returned instruction does not contain `Proposal`
- **AND** returned instruction does not contain `Apply`
- **AND** returned instruction does not contain `Archive`
- **AND** returned instruction does not contain `OpenSpec`
- **AND** returned instruction does not contain `worktree`
- **AND** returned instruction does not contain `commit`

### Requirement: fyllo-cortex has independent server metadata and tests

`fyllo-cortex` SHALL define its own server name and version module. Tests SHALL cover tool registration and response shape without depending on `fyllo-specs` internals.

#### Scenario: server metadata uses fyllo-cortex name

- **WHEN** `fyllo-cortex` starts its `McpServer`
- **THEN** the server name is `fyllo-cortex`

#### Scenario: tests verify guidelines response

- **WHEN** running MCP server tests
- **THEN** there is coverage that calls `guidelines`
- **AND** the test verifies the response contains `<tool_instruction>` and not `<state>`

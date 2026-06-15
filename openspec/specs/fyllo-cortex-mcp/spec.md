# fyllo-cortex-mcp Specification

## Purpose

Define the bundled `fyllo-cortex` MCP server contract. This server owns the project-guidelines tool surface and is the extension point for future FylloCode core tools.

## Requirements

### Requirement: fyllo-cortex MCP server 注册 guidelines 工具

`fyllo-cortex` MCP server SHALL 作为 bundled stdio MCP server 实现在 `src/mcp-servers/fyllo-cortex/` 下。它 SHALL 注册一个名为 `guidelines` 的工具，用于读取本地 guideline 元数据和返回 guideline 编写契约。

`guidelines` 工具 SHALL 接受 `mode` 字段，取值 SHALL 为 `"read"` 或 `"write"`。该工具 SHALL NOT 接受项目路径、OpenSpec change 名称或 workspace 控制参数，例如 `targetPath`、`changeName`、`includeInstruction` 或 `workspaceMode`。

#### Scenario: tool list contains guidelines

- **WHEN** MCP client calls `tools/list` on `fyllo-cortex`
- **THEN** the returned tool list contains a tool named `guidelines`
- **AND** no returned tool is namespaced under a legacy guidelines server name

#### Scenario: guidelines accepts only mode input

- **WHEN** MCP client calls `guidelines` with `{ "mode": "read" }` or `{ "mode": "write" }`
- **THEN** the call succeeds
- **AND** the tool does not require `targetPath`, `changeName`, `includeInstruction`, or `workspaceMode`

### Requirement: guidelines prompt 由 markdown 文件维护

The `guidelines` tool instruction body SHALL be maintained in `src/mcp-servers/fyllo-cortex/src/tools/instructions/guidelines.md`. TypeScript code SHALL NOT inline the instruction body as a long string literal. The MCP server implementation SHALL load the markdown prompt through the existing prompt loader pattern so esbuild can inline it with the existing `.md` text loader.

#### Scenario: prompt file exists

- **WHEN** checking `src/mcp-servers/fyllo-cortex/src/tools/instructions/`
- **THEN** `guidelines.md` exists

#### Scenario: instruction body is not embedded in tool code

- **WHEN** searching TypeScript files under `src/mcp-servers/fyllo-cortex/src/`
- **THEN** project guidelines instruction prose is not duplicated as long string literals in tool registration code
- **AND** the `guidelines` tool uses the markdown prompt loader to produce its write-mode response

### Requirement: guidelines instruction 定义项目 guideline 契约

The `guidelines.md` instruction body returned by `mode=write` SHALL define the project guidelines file contract and maintenance rules. It SHALL cover:

- root `AGENTS.md` as the agent-facing repository entry point
- `guidelines/*.md` as detailed topic documents
- a focused `Project Guidelines Index` section for root `AGENTS.md` that agents add only when local guideline links are missing or stale
- a recommended `guidelines/*.md` taxonomy for common repository surfaces such as architecture, code style, testing, data models, APIs, IPC, frontend, backend, build, security, dependencies, workflow, and domain rules
- guideline document format using stable sections and `MUST` / `SHOULD` / `MAY` normative terms
- topic-specific content checklists for common guideline files
- authoring rules based on repository evidence
- maintenance triggers for updating guidelines when project conventions change
- conflict handling when local guidelines disagree with higher-priority instructions or observed repository facts
- a YAML frontmatter description that defines the recommended frontmatter fields `name`, `description`, and `keywords`, including an example placed at the top of the document template and a note that `mode=read` parses these fields to surface guideline metadata

The instruction SHALL NOT mention Fyllo stage names or workflows, including Chat, Proposal, Apply, Archive, OpenSpec, worktrees, commits, archive, `mcp__fyllo_specs__*`, or Fyllo proposal tasks. Stage-specific orchestration belongs in system-reminder templates, not in the `guidelines` tool instruction.

#### Scenario: instruction includes file contract

- **WHEN** MCP client calls `guidelines` with `{ "mode": "write" }`
- **THEN** returned instruction mentions root `AGENTS.md`
- **AND** returned instruction mentions `guidelines/`
- **AND** returned instruction describes that repository-owned guidelines are maintained in the user's project

#### Scenario: instruction includes reusable guideline index and document templates

- **WHEN** MCP client calls `guidelines` with `{ "mode": "write" }`
- **THEN** returned instruction contains an `AGENTS.md` guidelines index section
- **AND** returned instruction tells agents not to generate or replace a full `AGENTS.md` document from this instruction
- **AND** returned instruction contains a recommended guideline files section
- **AND** returned instruction contains topic-specific content requirements
- **AND** returned instruction mentions `guidelines/Architecture.md`, `guidelines/CodeStyle.md`, `guidelines/Testing.md`, and `guidelines/DataModel.md`

#### Scenario: instruction remains workflow-agnostic

- **WHEN** MCP client calls `guidelines` with `{ "mode": "write" }`
- **THEN** returned instruction does not contain `Chat`
- **AND** returned instruction does not contain `Proposal`
- **AND** returned instruction does not contain `Apply`
- **AND** returned instruction does not contain `Archive`
- **AND** returned instruction does not contain `OpenSpec`
- **AND** returned instruction does not contain `worktree`
- **AND** returned instruction does not contain `commit`

### Requirement: fyllo-cortex has independent server metadata and tests

`fyllo-cortex` SHALL define its own server name and version module. Tests SHALL cover tool registration and response shape for both `mode=read` and `mode=write` without depending on `fyllo-specs` internals.

#### Scenario: server metadata uses fyllo-cortex name

- **WHEN** `fyllo-cortex` starts its `McpServer`
- **THEN** the server name is `fyllo-cortex`

#### Scenario: tests verify guidelines write response

- **WHEN** running MCP server tests
- **THEN** there is coverage that calls `guidelines` with `{ "mode": "write" }`
- **AND** the test verifies the response contains `<tool_instruction>` and not `<state>`

#### Scenario: tests verify guidelines read response

- **WHEN** running MCP server tests
- **THEN** there is coverage that calls `guidelines` with `{ "mode": "read" }` against a fixture project
- **AND** the test verifies the response is JSON with a `guidelines` array
- **AND** the test verifies entries from frontmatter, missing frontmatter, and malformed frontmatter cases all behave per the specification

### Requirement: guidelines tool returns mode-specific responses

The `guidelines` tool SHALL return responses whose shape is determined by the `mode` input field.

When `mode` is `"write"`, the tool SHALL return `content: [{ type: "text", text }]`, where `text` contains a `<tool_instruction>...</tool_instruction>` block holding the guideline authoring contract. The response SHALL NOT include a `<state>` block. The tool SHALL NOT mutate any repository file.

When `mode` is `"read"`, the tool SHALL return `content: [{ type: "text", text }]`, where `text` is a JSON document with a single root field named `guidelines` whose value is an array of guideline entries. The tool SHALL recursively scan `guidelines/**/*.md` under the MCP server's current working directory and produce one entry per matched file. The tool SHALL NOT mutate any repository file. If the `guidelines/` directory does not exist, the tool SHALL return `{ "guidelines": [] }` without error.

Each guideline entry SHALL include the following fields:

- `path`: project-root-relative POSIX path to the file, for example `guidelines/Architecture.md`.
- `name`: the value of `name` from the file's YAML frontmatter when it is a non-empty string; otherwise the file name stem.
- `description`: the value of `description` from the file's YAML frontmatter when it is a non-empty string; otherwise `null`.
- `keywords`: the value of `keywords` from the file's YAML frontmatter when it is an array of strings; otherwise `null`.

When the file has no leading `---` frontmatter delimiter, the entry SHALL still be returned with `description` and `keywords` set to `null` and `name` set to the file name stem. When the file has a frontmatter block but YAML parsing fails or the parsed value is not a plain object, the entry SHALL include an additional optional field `parseError` whose value is a short error message string, and `description` and `keywords` SHALL be `null`.

Entries SHALL be sorted by `path` in ascending lexicographic order.

#### Scenario: write mode returns instruction block

- **WHEN** MCP client calls `guidelines` with `{ "mode": "write" }`
- **THEN** response `content[0].type === "text"`
- **AND** response `content[0].text` contains `<tool_instruction>`
- **AND** response `content[0].text` contains `</tool_instruction>`
- **AND** response `content[0].text` does not contain `<state>`

#### Scenario: read mode returns guidelines array

- **WHEN** MCP client calls `guidelines` with `{ "mode": "read" }` in a project containing `guidelines/A.md` and `guidelines/B.md`
- **THEN** response `content[0].text` parses as JSON
- **AND** the JSON has a root field `guidelines` whose value is an array
- **AND** the array contains entries whose `path` values include `guidelines/A.md` and `guidelines/B.md`
- **AND** the entries are sorted by `path` ascending

#### Scenario: read mode parses frontmatter fields

- **WHEN** MCP client calls `guidelines` with `{ "mode": "read" }` and a guideline file declares `name: "Architecture"`, `description: "system layout"`, and `keywords: ["electron", "ipc"]` in its YAML frontmatter
- **THEN** the corresponding entry has `name === "Architecture"`
- **AND** the entry has `description === "system layout"`
- **AND** the entry has `keywords` deep-equal to `["electron", "ipc"]`

#### Scenario: read mode tolerates missing frontmatter

- **WHEN** MCP client calls `guidelines` with `{ "mode": "read" }` and a file `guidelines/Legacy.md` does not start with `---`
- **THEN** the corresponding entry has `path === "guidelines/Legacy.md"`
- **AND** the entry has `name === "Legacy"`
- **AND** the entry has `description === null`
- **AND** the entry has `keywords === null`
- **AND** the entry does not include `parseError`

#### Scenario: read mode reports frontmatter parse failure

- **WHEN** MCP client calls `guidelines` with `{ "mode": "read" }` and a file's frontmatter contains malformed YAML
- **THEN** the corresponding entry has `name === <file name stem>`
- **AND** the entry has `description === null`
- **AND** the entry has `keywords === null`
- **AND** the entry has `parseError` set to a non-empty string

#### Scenario: read mode supports nested directories

- **WHEN** MCP client calls `guidelines` with `{ "mode": "read" }` and the project contains `guidelines/src/renderer/Routing.md`
- **THEN** the response contains an entry with `path === "guidelines/src/renderer/Routing.md"`

#### Scenario: read mode returns empty array when guidelines directory missing

- **WHEN** MCP client calls `guidelines` with `{ "mode": "read" }` in a project that has no `guidelines/` directory
- **THEN** response `content[0].text` parses as JSON
- **AND** the JSON equals `{ "guidelines": [] }`

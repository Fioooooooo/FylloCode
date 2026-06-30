## MODIFIED Requirements

### Requirement: 内置 MCP server 以顶级构建目标形式存在

系统 SHALL 将随应用分发的 MCP server 源码组织在项目根目录 `src/mcp-servers/<server-name>/` 下，与 `src/main/`、`src/preload/`、`src/renderer/` 和 `src/shared/` 同属 `src/` 源码树。每个 MCP server 目录 SHALL 包含独立的 `src/` 与 `tsconfig.json`，对应测试 SHALL 位于 `test/mcp-servers/<server-name>/`，并 MAY 通过根 `package.json` 共享依赖与构建脚本。

当前内置 MCP server 集合 SHALL 由显式 registry 控制，包含且仅包含：

- `fyllo-specs`
- `fyllo-cortex`

系统 SHALL NOT 通过自动扫描 `src/mcp-servers/*` 目录来决定需要构建或注入哪些 bundled MCP server。

#### Scenario: fyllo-specs 源码位置

- **WHEN** 检查项目根目录
- **THEN** 存在 `src/mcp-servers/fyllo-specs/src/index.ts` 作为 stdio MCP server 的入口
- **AND** 存在 `src/mcp-servers/fyllo-specs/src/tools/instructions/` 目录包含 `explore.md`、`create-plan.md`、`create-proposal.md`、`apply-change.md`、`archive-change.md`
- **AND** 不在 `src/main/` 任何子目录下放置 MCP server 源码

#### Scenario: fyllo-cortex 源码位置

- **WHEN** 检查项目根目录
- **THEN** 存在 `src/mcp-servers/fyllo-cortex/src/index.ts` 作为 stdio MCP server 的入口
- **AND** 存在 `src/mcp-servers/fyllo-cortex/src/tools/instructions/guidelines.md`
- **AND** 不在 `src/main/` 任何子目录下放置 MCP server 源码

#### Scenario: bundled server 集合显式注册

- **WHEN** 检查 bundled MCP 构建脚本与主进程 registry
- **THEN** `fyllo-specs` 与 `fyllo-cortex` 均在显式 registry 或等价显式列表中声明
- **AND** registry 不通过目录扫描自动包含其他 `src/mcp-servers/*` 目录

## MODIFIED Requirements

### Requirement: 启动描述符由统一 infra 模块提供

系统 SHALL 在 `src/main/infra/mcp/bundled-mcp-servers.ts` 导出 `getBundledMcpServers(opts: { projectPath: string; fylloSessionId?: string }): McpServerSpec[]`，作为主进程侧获取内置 MCP server ACP 启动描述符的唯一入口。`fylloSessionId` 为可选入参：传入时用于注入会话级 env（见「通过环境变量传递项目上下文」Requirement），省略时不注入会话级 env。调用方 SHALL 不自行拼接 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 等打包布局细节。

返回的每个 `McpServerSpec` SHALL 至少包含 `name`、`command`、`args`、`env` 四个字段，用于传递给 ACP 的 `connection.newSession`、`connection.resumeSession` 与 `connection.loadSession`。

When bundled MCP is enabled, `getBundledMcpServers` SHALL return specs for both `fyllo-specs` and `fyllo-skills`. The returned order SHALL be stable with `fyllo-specs` before `fyllo-skills`.

#### Scenario: 开发环境 specs 指向 out 目录

- **WHEN** `getBundledMcpServers({ projectPath })` 在 `is.dev === true` 时被调用
- **THEN** 返回一个 `name === "fyllo-specs"` 的 spec，其 `args[0]` 指向项目根下的 `out/mcp-servers/fyllo-specs/index.js`
- **AND** 返回一个 `name === "fyllo-skills"` 的 spec，其 `args[0]` 指向项目根下的 `out/mcp-servers/fyllo-skills/index.js`

#### Scenario: 生产环境 specs 指向 unpacked resources 目录

- **WHEN** `getBundledMcpServers({ projectPath })` 在生产环境调用
- **THEN** `fyllo-specs` spec 的 `args[0]` 通过 `@main/infra/paths#getAppUnpackedPath()` 拼接 `mcp-servers/fyllo-specs/index.js` 得到
- **AND** `fyllo-skills` spec 的 `args[0]` 通过 `@main/infra/paths#getAppUnpackedPath()` 拼接 `mcp-servers/fyllo-skills/index.js` 得到
- **AND** 不包含对 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 的直接引用

#### Scenario: 启动命令统一使用 Electron binary 作 Node

- **WHEN** 读取任意返回 spec 的 `command` 字段
- **THEN** 值为 `process.execPath`
- **AND** `env` 中包含 `ELECTRON_RUN_AS_NODE: "1"`

### Requirement: 通过环境变量传递项目上下文

系统 SHALL 在每个 `McpServerSpec.env` 中至少注入下列环境变量，使 MCP server 不依赖 `cwd` 即可确定其工作的项目根路径、事件输出目录与遥测开关：

| 变量                   | 取值                                   | 用途                             |
| ---------------------- | -------------------------------------- | -------------------------------- |
| `ELECTRON_RUN_AS_NODE` | `"1"`                                  | 将 Electron 二进制作为 Node 运行 |
| `FYLLO_PROJECT_PATH`   | 当前项目的绝对 `projectPath`           | MCP server 定位当前项目根目录    |
| `FYLLO_MCP_TELEMETRY`  | `"0"`                                  | 显式关闭所有遥测上报             |
| `FYLLO_MCP_EVENT_DIR`  | `mcpEventsDir(projectPath)` 的绝对路径 | MCP server 写出事件文件的目录    |

`FYLLO_MCP_EVENT_DIR` SHALL 始终注入，值为基于主项目 `projectPath` 计算的 `mcpEventsDir(projectPath)`（见 `lineage-proposal-link` spec）。

当 `getBundledMcpServers` 的入参 `fylloSessionId` 为非空字符串时，系统 SHALL 额外向每个 spec 的 env 注入 `FYLLO_SESSION_ID`，值等于该 `fylloSessionId`；当入参未提供 `fylloSessionId`（如 probe 在尚无 fylloSessionId 阶段调用）时，env SHALL NOT 包含 `FYLLO_SESSION_ID`。

MCP server 实现 SHALL 优先读取 `FYLLO_PROJECT_PATH` 而非 `process.cwd()` 来解析项目路径。

Only the `fyllo-specs` spec SHALL receive `FYLLO_OPENSPEC_CLI_PATH`; `fyllo-skills` SHALL NOT receive that OpenSpec-specific environment variable.

#### Scenario: env 覆盖完整

- **WHEN** `getBundledMcpServers({ projectPath })` 返回 spec
- **THEN** every returned spec env contains `ELECTRON_RUN_AS_NODE`, `FYLLO_PROJECT_PATH`, `FYLLO_MCP_TELEMETRY`, and `FYLLO_MCP_EVENT_DIR`
- **AND** every returned spec env has `FYLLO_PROJECT_PATH` equal to the input `projectPath`
- **AND** every returned spec env has `FYLLO_MCP_EVENT_DIR` equal to `mcpEventsDir(projectPath)`

#### Scenario: 提供 fylloSessionId 时注入 FYLLO_SESSION_ID

- **WHEN** `getBundledMcpServers({ projectPath, fylloSessionId: "sess-1" })` 被调用
- **THEN** every returned spec env contains `FYLLO_SESSION_ID` equal to `"sess-1"`

#### Scenario: 未提供 fylloSessionId 时不注入 FYLLO_SESSION_ID

- **WHEN** `getBundledMcpServers({ projectPath })` 被调用且未传 `fylloSessionId`
- **THEN** no returned spec env contains `FYLLO_SESSION_ID`

#### Scenario: OpenSpec CLI env 只提供给 fyllo-specs

- **WHEN** `getBundledMcpServers({ projectPath })` 返回 specs
- **THEN** the `name === "fyllo-specs"` spec env contains `FYLLO_OPENSPEC_CLI_PATH`
- **AND** the `name === "fyllo-skills"` spec env does not contain `FYLLO_OPENSPEC_CLI_PATH`

#### Scenario: MCP server 优先使用 FYLLO_PROJECT_PATH

- **WHEN** a bundled MCP server starts and needs the current project root
- **THEN** 系统 SHALL read `process.env.FYLLO_PROJECT_PATH` as the base project directory
- **AND** only fall back to `process.cwd()` when that variable is missing

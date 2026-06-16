## MODIFIED Requirements

### Requirement: 通过环境变量传递项目上下文

系统 SHALL 在每个 `McpServerSpec.env` 中至少注入下列环境变量，使 MCP server 不依赖 `cwd` 即可确定其工作的项目根路径、项目数据目录、事件输出目录与遥测开关：

| 变量                     | 取值                                   | 用途                                           |
| ------------------------ | -------------------------------------- | ---------------------------------------------- |
| `ELECTRON_RUN_AS_NODE`   | `"1"`                                  | 将 Electron 二进制作为 Node 运行               |
| `FYLLO_PROJECT_PATH`     | 当前项目的绝对 `projectPath`           | MCP server 定位当前项目源码根目录              |
| `FYLLO_PROJECT_DATA_DIR` | `projectDir(projectPath)` 的绝对路径   | MCP server 定位当前项目的 FylloCode 数据根目录 |
| `FYLLO_MCP_TELEMETRY`    | `"0"`                                  | 显式关闭所有遥测上报                           |
| `FYLLO_MCP_EVENT_DIR`    | `mcpEventsDir(projectPath)` 的绝对路径 | MCP server 写出事件文件的目录                  |

`FYLLO_PROJECT_DATA_DIR` SHALL 始终注入，值为主进程通过 `src/main/infra/storage/project-paths.ts` 的 `projectDir(projectPath)` 计算得到的绝对路径。`projectDir(projectPath)` SHALL 继续复用 `getDataSubPath("projects")` 与 `encodeProjectPath(projectPath)`，使开发环境与生产环境的数据根路径差异仍由主进程 `getDataSubPath` 统一处理。

`FYLLO_MCP_EVENT_DIR` SHALL 始终注入，值为基于主项目 `projectPath` 计算的 `mcpEventsDir(projectPath)`（见 `lineage-proposal-link` spec）。

当 `getBundledMcpServers` 的入参 `fylloSessionId` 为非空字符串时，系统 SHALL 额外向每个 spec 的 env 注入 `FYLLO_SESSION_ID`，值等于该 `fylloSessionId`；当入参未提供 `fylloSessionId`（如 probe 在尚无 fylloSessionId 阶段调用）时，env SHALL NOT 包含 `FYLLO_SESSION_ID`。

MCP server 实现 SHALL 优先读取 `FYLLO_PROJECT_PATH` 而非 `process.cwd()` 来解析项目源码路径。需要读取 FylloCode 项目级持久化数据的 MCP server SHALL 使用 `FYLLO_PROJECT_DATA_DIR`，不得通过 `FYLLO_MCP_EVENT_DIR` 的父目录、`FYLLO_PROJECT_PATH` 或硬编码 userData 路径推导项目数据目录。

只有 `fyllo-specs` spec SHALL 接收 `FYLLO_OPENSPEC_CLI_PATH`；`fyllo-cortex` SHALL NOT 接收该 OpenSpec 专用环境变量。

#### Scenario: env 覆盖完整

- **WHEN** `getBundledMcpServers({ projectPath })` 返回 spec
- **THEN** 每个返回 spec 的 env 都包含 `ELECTRON_RUN_AS_NODE`、`FYLLO_PROJECT_PATH`、`FYLLO_PROJECT_DATA_DIR`、`FYLLO_MCP_TELEMETRY` 与 `FYLLO_MCP_EVENT_DIR`
- **AND** 每个返回 spec 的 env 中 `FYLLO_PROJECT_PATH` 都等于输入的 `projectPath`
- **AND** 每个返回 spec 的 env 中 `FYLLO_PROJECT_DATA_DIR` 都等于 `projectDir(projectPath)`
- **AND** 每个返回 spec 的 env 中 `FYLLO_MCP_EVENT_DIR` 都等于 `mcpEventsDir(projectPath)`

#### Scenario: project data dir 由主进程数据路径体系计算

- **WHEN** 主进程为 `projectPath` 构造 bundled MCP server env
- **THEN** `FYLLO_PROJECT_DATA_DIR` 的值通过 `projectDir(projectPath)` 得到
- **AND** `projectDir(projectPath)` 使用 `getDataSubPath("projects")` 作为根路径
- **AND** `projectDir(projectPath)` 使用 `encodeProjectPath(projectPath)` 作为项目目录名

#### Scenario: 提供 fylloSessionId 时注入 FYLLO_SESSION_ID

- **WHEN** `getBundledMcpServers({ projectPath, fylloSessionId: "sess-1" })` 被调用
- **THEN** 每个返回 spec 的 env 都包含等于 `"sess-1"` 的 `FYLLO_SESSION_ID`

#### Scenario: 未提供 fylloSessionId 时不注入 FYLLO_SESSION_ID

- **WHEN** `getBundledMcpServers({ projectPath })` 被调用且未传 `fylloSessionId`
- **THEN** 所有返回 spec 的 env 都不包含 `FYLLO_SESSION_ID`

#### Scenario: OpenSpec CLI env 只提供给 fyllo-specs

- **WHEN** `getBundledMcpServers({ projectPath })` 返回 specs
- **THEN** `name === "fyllo-specs"` 的 spec env 包含 `FYLLO_OPENSPEC_CLI_PATH`
- **AND** `name === "fyllo-cortex"` 的 spec env 不包含 `FYLLO_OPENSPEC_CLI_PATH`

#### Scenario: MCP server 优先使用 FYLLO_PROJECT_PATH

- **WHEN** 内置 MCP server 启动且需要当前项目源码根目录
- **THEN** 系统 SHALL 读取 `process.env.FYLLO_PROJECT_PATH` 作为基础项目目录
- **AND** 仅在该变量缺失时回退到 `process.cwd()`

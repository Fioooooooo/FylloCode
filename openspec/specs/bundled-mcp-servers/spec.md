# bundled-mcp-servers 规范

## Purpose

定义 FylloCode 内置 MCP server 的分发契约、启动参数构造、env 约定、路径解析规则，以及与 ACP `newSession` / `resumeSession` 的对接方式。

## Requirements

### Requirement: 内置 MCP server 以顶级构建目标形式存在

系统 SHALL 将随应用分发的 MCP server 源码组织在项目根目录 `src/mcp-servers/<server-name>/` 下，与 `src/main/`、`src/preload/`、`src/renderer/` 和 `src/shared/` 同属 `src/` 源码树。每个 MCP server 目录 SHALL 包含独立的 `src/` 与 `tsconfig.json`，对应测试 SHALL 位于 `test/mcp-servers/<server-name>/`，并 MAY 通过根 `package.json` 共享依赖与构建脚本。

当前内置 MCP server 集合 SHALL 由显式 registry 控制，包含且仅包含：

- `fyllo-specs`
- `fyllo-cortex`

系统 SHALL NOT 通过自动扫描 `src/mcp-servers/*` 目录来决定需要构建或注入哪些 bundled MCP server。

#### Scenario: fyllo-specs 源码位置

- **WHEN** 检查项目根目录
- **THEN** 存在 `src/mcp-servers/fyllo-specs/src/index.ts` 作为 stdio MCP server 的入口
- **AND** 存在 `src/mcp-servers/fyllo-specs/src/tools/instructions/` 目录包含四个 markdown 文件
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

### Requirement: 构建产物输出与分发位置

系统 SHALL 把每个内置 MCP server 构建为单文件 JS bundle，输出到 `out/mcp-servers/<server-name>/index.js`（dev 与构建阶段）。electron-builder 打包时 SHALL 通过 `extraResources` 将 `out/mcp-servers/` 复制到打包后 app 的 `Contents/Resources/mcp-servers/`（macOS；Windows / Linux 按各自的 app resources 目录），SHALL 位于 asar 外部以便 spawn 执行。项目根的 `resources/` 源目录（git-tracked）SHALL 不承载 MCP server 产物。

`scripts/build-mcp-servers.mjs` SHALL 构建所有显式注册的内置 MCP servers。共享 esbuild 配置 SHALL 包含 markdown 文本 loader，使 prompt markdown 文件能被打包进对应 server。

#### Scenario: 开发环境 bundle 可执行

- **WHEN** 执行 `pnpm build:mcp-servers`
- **THEN** `out/mcp-servers/fyllo-specs/index.js` 生成
- **AND** `out/mcp-servers/fyllo-cortex/index.js` 生成
- **AND** 每个生成的 bundle 都能通过带 `ELECTRON_RUN_AS_NODE=1` 的 `process.execPath` 或系统 `node` 启动为 stdio MCP server

#### Scenario: 生产打包产物位置

- **WHEN** `electron-builder` 打包完成
- **THEN** 应用包内存在 `Contents/Resources/app.asar.unpacked/mcp-servers/fyllo-specs/index.js`（或对应平台的等价路径）
- **AND** 应用包内存在 `Contents/Resources/app.asar.unpacked/mcp-servers/fyllo-cortex/index.js`（或对应平台的等价路径）
- **AND** 这些文件位于 app.asar 外部，可作为外部 Node 文件启动
- **AND** 项目源仓库的 `resources/` 目录不包含 `mcp-servers/` 子目录

### Requirement: 启动描述符由统一 infra 模块提供

系统 SHALL 在 `src/main/infra/mcp/bundled-mcp-servers.ts` 导出 `getBundledMcpServers(opts: { projectPath: string; fylloSessionId?: string }): McpServerSpec[]`，作为主进程侧获取内置 MCP server ACP 启动描述符的唯一入口。`fylloSessionId` 为可选入参：传入时用于注入会话级 env（见「通过环境变量传递项目上下文」Requirement），省略时不注入会话级 env。调用方 SHALL 不自行拼接 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 等打包布局细节。

返回的每个 `McpServerSpec` SHALL 至少包含 `name`、`command`、`args`、`env` 四个字段，用于传递给 ACP 的 `connection.newSession`、`connection.resumeSession` 与 `connection.loadSession`。

当内置 MCP 启用时，`getBundledMcpServers` SHALL 同时返回 `fyllo-specs` 与 `fyllo-cortex` 的 specs。返回顺序 SHALL 保持稳定，`fyllo-specs` 位于 `fyllo-cortex` 之前。

#### Scenario: 开发环境 specs 指向 out 目录

- **WHEN** `getBundledMcpServers({ projectPath })` 在 `is.dev === true` 时被调用
- **THEN** 返回一个 `name === "fyllo-specs"` 的 spec，其 `args[0]` 指向项目根下的 `out/mcp-servers/fyllo-specs/index.js`
- **AND** 返回一个 `name === "fyllo-cortex"` 的 spec，其 `args[0]` 指向项目根下的 `out/mcp-servers/fyllo-cortex/index.js`

#### Scenario: 生产环境 specs 指向 unpacked resources 目录

- **WHEN** `getBundledMcpServers({ projectPath })` 在生产环境调用
- **THEN** `fyllo-specs` spec 的 `args[0]` 通过 `@main/infra/paths#getAppUnpackedPath()` 拼接 `mcp-servers/fyllo-specs/index.js` 得到
- **AND** `fyllo-cortex` spec 的 `args[0]` 通过 `@main/infra/paths#getAppUnpackedPath()` 拼接 `mcp-servers/fyllo-cortex/index.js` 得到
- **AND** 不包含对 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 的直接引用

#### Scenario: 启动命令统一使用 Electron binary 作 Node

- **WHEN** 读取任意返回 spec 的 `command` 字段
- **THEN** 值为 `process.execPath`
- **AND** `env` 中包含 `ELECTRON_RUN_AS_NODE: "1"`

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

### Requirement: 紧急关闭开关 via 环境变量

系统 SHALL 在 `getBundledMcpServers` 中检测环境变量 `FYLLO_DISABLE_BUNDLED_MCP`，当其值等于 `"1"` 时返回空数组，以便出现严重问题时快速回退至"无内置 MCP"状态且不需要重新打包。

#### Scenario: disable 开关生效

- **WHEN** 启动 Electron 主进程前设置环境变量 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **AND** `getBundledMcpServers({ projectPath })` 被调用
- **THEN** 返回 `[]`
- **AND** 不包含 `fyllo-specs` 或 `fyllo-cortex`

### Requirement: 内置 MCP server 不注册为主进程 disposable

内置 MCP server 的生命周期 SHALL 由 ACP agent（作为其子进程管理）负责，而非 Electron 主进程。因此 `bundled-mcp-servers.ts` SHALL 不调用 `registerDisposable`，也不维护任何 `ChildProcess` 引用。

#### Scenario: 不创建主进程 disposable

- **WHEN** 搜索 `src/main/infra/mcp/` 下所有文件
- **THEN** 不存在对 `registerDisposable` 的调用
- **AND** 不存在 `spawn`、`ChildProcess`、`fork` 的 import 或使用

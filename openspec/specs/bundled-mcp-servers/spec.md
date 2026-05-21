# bundled-mcp-servers Specification

## Purpose

定义 FylloCode 内置 MCP server 的分发契约、启动参数构造、env 约定、路径解析规则，以及与 ACP `newSession` / `resumeSession` 的对接方式。

## Requirements

### Requirement: 内置 MCP server 以顶级构建目标形式存在

系统 SHALL 将随应用分发的 MCP server 源码组织在项目根目录 `mcp-servers/<server-name>/` 下，与 `electron/`、`frontend/` 同级。每个 MCP server 目录 SHALL 包含独立的 `src/`、`package.json`（或共享根 `package.json` 的入口）、`tsconfig.json`、`__tests__/` 结构。

#### Scenario: fyllo-specs 源码位置

- **WHEN** 检查项目根目录
- **THEN** 存在 `mcp-servers/fyllo-specs/src/index.ts` 作为 stdio MCP server 的入口
- **AND** 存在 `mcp-servers/fyllo-specs/src/tools/instructions/` 目录包含四个 markdown 文件
- **AND** 不在 `electron/main/` 任何子目录下放置 MCP server 源码

### Requirement: 构建产物输出与分发位置

系统 SHALL 把每个内置 MCP server 构建为单文件 JS bundle，输出到 `out/mcp-servers/<server-name>/index.js`（dev 与构建阶段）。electron-builder 打包时 SHALL 通过 `extraResources` 将 `out/mcp-servers/` 复制到打包后 app 的 `Contents/Resources/mcp-servers/`（macOS；Windows / Linux 按各自的 app resources 目录），SHALL 位于 asar 外部以便 spawn 执行。项目根的 `resources/` 源目录（git-tracked）SHALL 不承载 MCP server 产物。

#### Scenario: 开发环境 bundle 可执行

- **WHEN** 执行 `pnpm build`
- **THEN** `out/mcp-servers/fyllo-specs/index.js` 生成
- **AND** 该 bundle 通过 `process.execPath`（with `ELECTRON_RUN_AS_NODE=1`）或系统 `node` 可启动 stdio MCP 协议

#### Scenario: 生产打包产物位置

- **WHEN** `electron-builder` 打包完成
- **THEN** 应用包内存在 `Contents/Resources/mcp-servers/fyllo-specs/index.js`（或对应平台的等价路径）
- **AND** 该文件位于 asar 之外（可被 Node 作为外部文件 spawn）
- **AND** 项目源仓库的 `resources/` 目录不包含 `mcp-servers/` 子目录

### Requirement: 启动描述符由统一 infra 模块提供

系统 SHALL 在 `electron/main/infra/mcp/bundled-mcp-servers.ts` 导出 `getBundledMcpServers(opts: { projectPath: string }): McpServerSpec[]`，作为主进程侧获取内置 MCP server ACP 启动描述符的唯一入口。调用方 SHALL 不自行拼接 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 等打包布局细节。

返回的每个 `McpServerSpec` SHALL 至少包含 `name`、`command`、`args`、`env` 四个字段，用于传递给 ACP 的 `connection.newSession`。

#### Scenario: 开发环境 spec 指向 out 目录

- **WHEN** `getBundledMcpServers({ projectPath })` 在 `is.dev === true` 时被调用
- **THEN** 返回的 spec 中 `args[0]` 指向项目根下的 `out/mcp-servers/fyllo-specs/index.js`

#### Scenario: 生产环境 spec 指向 resources 目录

- **WHEN** `getBundledMcpServers({ projectPath })` 在生产环境调用
- **THEN** 返回的 spec 中 `args[0]` 通过 `@main/infra/paths#getResourcesPath()` 拼接 `mcp-servers/fyllo-specs/index.js` 得到
- **AND** 不包含对 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 的直接引用

#### Scenario: 启动命令统一使用 Electron binary 作 Node

- **WHEN** 读取任意返回 spec 的 `command` 字段
- **THEN** 值为 `process.execPath`
- **AND** `env` 中包含 `ELECTRON_RUN_AS_NODE: "1"`

### Requirement: 通过环境变量传递项目上下文

系统 SHALL 在 `McpServerSpec.env` 中至少注入下列环境变量，使 MCP server 不依赖 `cwd` 即可确定其工作的项目根路径与遥测开关：

| 变量                   | 取值                         | 用途                               |
| ---------------------- | ---------------------------- | ---------------------------------- |
| `ELECTRON_RUN_AS_NODE` | `"1"`                        | 将 Electron 二进制作为 Node 运行   |
| `FYLLO_PROJECT_PATH`   | 当前项目的绝对 `projectPath` | MCP server 定位 `openspec/` 根目录 |
| `FYLLO_MCP_TELEMETRY`  | `"0"`                        | 显式关闭所有遥测上报               |

MCP server 实现 SHALL 优先读取 `FYLLO_PROJECT_PATH` 而非 `process.cwd()` 来解析项目路径。

#### Scenario: env 覆盖完整

- **WHEN** `getBundledMcpServers({ projectPath })` 返回 spec
- **THEN** `spec.env` 至少包含 `ELECTRON_RUN_AS_NODE`、`FYLLO_PROJECT_PATH`、`FYLLO_MCP_TELEMETRY` 三个键
- **AND** `FYLLO_PROJECT_PATH` 等于传入的 `projectPath` 参数

#### Scenario: MCP server 优先使用 FYLLO_PROJECT_PATH

- **WHEN** fyllo-specs MCP server 启动后需要读取 `openspec/config.yaml`
- **THEN** 系统 SHALL 读取 `process.env.FYLLO_PROJECT_PATH` 作为基准目录
- **AND** 仅在该变量缺失时回退到 `process.cwd()`

### Requirement: 紧急关闭开关 via 环境变量

系统 SHALL 在 `getBundledMcpServers` 中检测环境变量 `FYLLO_DISABLE_BUNDLED_MCP`，当其值等于 `"1"` 时返回空数组，以便出现严重问题时快速回退至"无内置 MCP"状态且不需要重新打包。

#### Scenario: disable 开关生效

- **WHEN** 启动 Electron 主进程前设置环境变量 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **AND** `getBundledMcpServers({ projectPath })` 被调用
- **THEN** 返回 `[]`

### Requirement: 内置 MCP server 不注册为主进程 disposable

内置 MCP server 的生命周期 SHALL 由 ACP agent（作为其子进程管理）负责，而非 Electron 主进程。因此 `bundled-mcp-servers.ts` SHALL 不调用 `registerDisposable`，也不维护任何 `ChildProcess` 引用。

#### Scenario: 不创建主进程 disposable

- **WHEN** 搜索 `electron/main/infra/mcp/` 下所有文件
- **THEN** 不存在对 `registerDisposable` 的调用
- **AND** 不存在 `spawn`、`ChildProcess`、`fork` 的 import 或使用

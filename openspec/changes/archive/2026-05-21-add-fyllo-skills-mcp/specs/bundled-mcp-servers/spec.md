## MODIFIED Requirements

### Requirement: 内置 MCP server 以顶级构建目标形式存在

系统 SHALL 将随应用分发的 MCP server 源码组织在项目根目录 `mcp-servers/<server-name>/` 下，与 `electron/`、`frontend/` 同级。每个 MCP server 目录 SHALL 包含独立的 `src/`、`tsconfig.json`、`__tests__/` 结构，并 MAY 通过根 `package.json` 共享依赖与构建脚本。

当前内置 MCP server 集合 SHALL 由显式 registry 控制，包含且仅包含：

- `fyllo-specs`
- `fyllo-skills`

系统 SHALL NOT 通过自动扫描 `mcp-servers/*` 目录来决定需要构建或注入哪些 bundled MCP server。

#### Scenario: fyllo-specs 源码位置

- **WHEN** 检查项目根目录
- **THEN** 存在 `mcp-servers/fyllo-specs/src/index.ts` 作为 stdio MCP server 的入口
- **AND** 存在 `mcp-servers/fyllo-specs/src/tools/instructions/` 目录包含四个 markdown 文件
- **AND** 不在 `electron/main/` 任何子目录下放置 MCP server 源码

#### Scenario: fyllo-skills 源码位置

- **WHEN** 检查项目根目录
- **THEN** 存在 `mcp-servers/fyllo-skills/src/index.ts` 作为 stdio MCP server 的入口
- **AND** 存在 `mcp-servers/fyllo-skills/src/tools/instructions/guidelines.md`
- **AND** 不在 `electron/main/` 任何子目录下放置 MCP server 源码

#### Scenario: bundled server 集合显式注册

- **WHEN** 检查 bundled MCP 构建脚本与主进程 registry
- **THEN** `fyllo-specs` 与 `fyllo-skills` 均在显式 registry 或等价显式列表中声明
- **AND** registry 不通过目录扫描自动包含其他 `mcp-servers/*` 目录

### Requirement: 构建产物输出与分发位置

系统 SHALL 把每个内置 MCP server 构建为单文件 JS bundle，输出到 `out/mcp-servers/<server-name>/index.js`（dev 与构建阶段）。electron-builder 打包时 SHALL 通过 `extraResources` 将 `out/mcp-servers/` 复制到打包后 app 的 `Contents/Resources/mcp-servers/`（macOS；Windows / Linux 按各自的 app resources 目录），SHALL 位于 asar 外部以便 spawn 执行。项目根的 `resources/` 源目录（git-tracked）SHALL 不承载 MCP server 产物。

`scripts/build-mcp-servers.mjs` SHALL build all explicitly registered bundled MCP servers. Shared esbuild settings SHALL include the markdown text loader so prompt markdown files can be bundled into each server.

#### Scenario: 开发环境 bundle 可执行

- **WHEN** 执行 `pnpm build:mcp-servers`
- **THEN** `out/mcp-servers/fyllo-specs/index.js` 生成
- **AND** `out/mcp-servers/fyllo-skills/index.js` 生成
- **AND** each generated bundle can be started as a stdio MCP server through `process.execPath` with `ELECTRON_RUN_AS_NODE=1` or a system `node`

#### Scenario: 生产打包产物位置

- **WHEN** `electron-builder` 打包完成
- **THEN** 应用包内存在 `Contents/Resources/app.asar.unpacked/mcp-servers/fyllo-specs/index.js`（或对应平台的等价路径）
- **AND** 应用包内存在 `Contents/Resources/app.asar.unpacked/mcp-servers/fyllo-skills/index.js`（或对应平台的等价路径）
- **AND** these files are located outside app.asar and can be spawned as external Node files
- **AND** 项目源仓库的 `resources/` 目录不包含 `mcp-servers/` 子目录

### Requirement: 启动描述符由统一 infra 模块提供

系统 SHALL 在 `electron/main/infra/mcp/bundled-mcp-servers.ts` 导出 `getBundledMcpServers(opts: { projectPath: string }): McpServerSpec[]`，作为主进程侧获取内置 MCP server ACP 启动描述符的唯一入口。调用方 SHALL 不自行拼接 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 等打包布局细节。

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

系统 SHALL 在每个 `McpServerSpec.env` 中至少注入下列环境变量，使 MCP server 不依赖 `cwd` 即可确定其工作的项目根路径与遥测开关：

| 变量                   | 取值                         | 用途                             |
| ---------------------- | ---------------------------- | -------------------------------- |
| `ELECTRON_RUN_AS_NODE` | `"1"`                        | 将 Electron 二进制作为 Node 运行 |
| `FYLLO_PROJECT_PATH`   | 当前项目的绝对 `projectPath` | MCP server 定位当前项目根目录    |
| `FYLLO_MCP_TELEMETRY`  | `"0"`                        | 显式关闭所有遥测上报             |

MCP server 实现 SHALL 优先读取 `FYLLO_PROJECT_PATH` 而非 `process.cwd()` 来解析项目路径。

Only the `fyllo-specs` spec SHALL receive `FYLLO_OPENSPEC_CLI_PATH`; `fyllo-skills` SHALL NOT receive that OpenSpec-specific environment variable.

#### Scenario: env 覆盖完整

- **WHEN** `getBundledMcpServers({ projectPath })` 返回 spec
- **THEN** every returned spec env contains `ELECTRON_RUN_AS_NODE`, `FYLLO_PROJECT_PATH`, and `FYLLO_MCP_TELEMETRY`
- **AND** every returned spec env has `FYLLO_PROJECT_PATH` equal to the input `projectPath`

#### Scenario: OpenSpec CLI env 只提供给 fyllo-specs

- **WHEN** `getBundledMcpServers({ projectPath })` 返回 specs
- **THEN** the `name === "fyllo-specs"` spec env contains `FYLLO_OPENSPEC_CLI_PATH`
- **AND** the `name === "fyllo-skills"` spec env does not contain `FYLLO_OPENSPEC_CLI_PATH`

#### Scenario: MCP server 优先使用 FYLLO_PROJECT_PATH

- **WHEN** a bundled MCP server starts and needs the current project root
- **THEN** 系统 SHALL read `process.env.FYLLO_PROJECT_PATH` as the base project directory
- **AND** only fall back to `process.cwd()` when that variable is missing

### Requirement: 紧急关闭开关 via 环境变量

系统 SHALL 在 `getBundledMcpServers` 中检测环境变量 `FYLLO_DISABLE_BUNDLED_MCP`，当其值等于 `"1"` 时返回空数组，以便出现严重问题时快速回退至"无内置 MCP"状态且不需要重新打包。

#### Scenario: disable 开关生效

- **WHEN** 启动 Electron 主进程前设置环境变量 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **AND** `getBundledMcpServers({ projectPath })` 被调用
- **THEN** 返回 `[]`
- **AND** neither `fyllo-specs` nor `fyllo-skills` is included

### Requirement: 内置 MCP server 不注册为主进程 disposable

内置 MCP server 的生命周期 SHALL 由 ACP agent（作为其子进程管理）负责，而非 Electron 主进程。因此 `bundled-mcp-servers.ts` SHALL 不调用 `registerDisposable`，也不维护任何 `ChildProcess` 引用。

#### Scenario: 不创建主进程 disposable

- **WHEN** 搜索 `electron/main/infra/mcp/` 下所有文件
- **THEN** 不存在对 `registerDisposable` 的调用
- **AND** 不存在 `spawn`、`ChildProcess`、`fork` 的 import 或使用

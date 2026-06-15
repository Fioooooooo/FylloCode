## Why

FylloCode 希望吸取 OpenSpec 的规范方法，并让内置的 ACP agent 在 chat session 中直接使用 `fyllo-propose`、`fyllo-apply-change`、`fyllo-archive-change`、`openspec-explore` 四个 skill 的能力。但 ACP 协议在 `connection.newSession` / `resumeSession` 时只接受一组 MCP server 描述符，无法像 Claude Code CLI 那样从本地 `.claude/skills/` 读取 skill 目录；同时项目要求"开箱即用"，不能依赖用户机器上预装 OpenSpec CLI。因此需要新增一个随应用分发的 MCP server，由 Electron 主进程在每次 newSession 时统一注入给 ACP agent。

## What Changes

- 新增顶级构建目标 `mcp-servers/fyllo-specs/`，输出一个独立的 stdio MCP server 可执行 bundle，注册四个 tool：`explore` / `create-proposal` / `apply-change` / `archive-change`，分别对应四个 openspec skill 的工作流程。
- 四个 tool 的 prompt 以独立 markdown 文件存放在 `mcp-servers/fyllo-specs/src/prompts/`，tool 返回体由该 prompt 加实时计算出的工作区 state 组成；改动 prompt 不需要重写 TypeScript。
- 把 `@fission-ai/openspec@~1.3.1` 作为生产依赖随应用分发；**MCP server 通过 spawn 其 CLI（`bin/openspec.js`）** 完成 `list` / `status` / `instructions` / `new change` 等动作，以 `--json` stdout 作为结构化接口，不 import 该包的 JS 运行时（因上游 `package.json#exports` 仅开放根入口，`dist/core/*` 属于内部实现）。归档动作由 MCP server 用 `fs.rename` 自行完成。以上逻辑集中在薄适配层 `openspec-runtime/`。
- 新增 `electron/main/infra/mcp/bundled-mcp-servers.ts`，统一生成内置 MCP server 的 ACP 启动描述符（`command`/`args`/`env`），路径解析走 `@main/infra/paths#getResourcesPath()`；dev 指向 `out/mcp-servers/<name>/index.js`，prod 指向 electron-builder `extraResources` 复制后的 `Resources/mcp-servers/<name>/index.js`；启动命令统一用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1`，不依赖用户系统 Node。
- 修改 `electron/main/services/chat/acp-session.ts` 对 `connection.newSession` 与 `connection.resumeSession` 的调用，把 `mcpServers` 参数换成 `getBundledMcpServers({ projectPath })`，通过 `FYLLO_PROJECT_PATH` 环境变量告知 MCP server 当前项目根目录。
- 更新 `electron.vite.config.ts` 增加 MCP server 的 Node lib 构建入口；`electron-builder.yml` 通过 `extraResources` 把 MCP bundle 纳入 `Resources/mcp-servers/`，并通过 `files`/`asarUnpack` 保留打包后的 `@fission-ai/openspec` CLI 可执行文件。
- 引入 `@modelcontextprotocol/sdk` 与 `@fission-ai/openspec` 两个生产依赖；前者 MCP server bundle 内联，后者以 external 形式保留以便 spawn CLI。

## Capabilities

### New Capabilities

- `bundled-mcp-servers`: 内置 MCP server 的分发契约、启动参数构造、env 约定、路径解析规则、与 ACP newSession / resumeSession 的对接方式。
- `fyllo-specs-mcp`: `fyllo-specs` MCP server 本身——四个 tool 的输入 schema、返回结构、prompt 独立文件约定、底层 openspec-runtime 适配层的职责边界、错误归一化行为。

### Modified Capabilities

- `acp-chat-backend`: `newSession` 调用从 `mcpServers: []` 改为注入 bundled MCP server 列表；原先"不挂载 MCP"的 scenario 需要更新。

## Impact

- **代码**：
  - 新增目录 `mcp-servers/fyllo-specs/`（源码 + prompts + runtime 适配 + 单测）。
  - 新增 `electron/main/infra/mcp/bundled-mcp-servers.ts`。
  - 修改 `electron/main/services/chat/acp-session.ts` 的 `newSession` 调用点（唯一注入点）。
  - 修改 `electron.vite.config.ts`、`electron-builder.yml`、根 `package.json`（新增两条 dep）。
  - 更新 `docs/Architecture.md`、`docs/MainProcess.md`："顶层目录"、"路径规范"、"资源分发"章节。
- **依赖**：新增 `@modelcontextprotocol/sdk`、`@fission-ai/openspec@~1.3.1`。前者体积 <200KB，内联进 MCP server bundle；后者作为 external 依赖随应用分发 CLI 入口，约 1–2MB，通过 electron-builder 的 `files`/`asarUnpack` 保留可执行。
- **分发产物**：新增 `<app>/Contents/Resources/mcp-servers/fyllo-specs/index.js`，走 extraResources；`@fission-ai/openspec` 的 `bin/openspec.js` 随应用 node_modules 分发；整体体积增量约 2–3MB。
- **运行时行为**：每个 ACP session 将挂载一个内置 MCP server；chat session 首次使用时会 spawn 一个新的 Node 子进程（由 ACP agent 管理生命周期，非主进程 disposable）。
- **向后兼容**：不破坏既有 chat session 元数据格式与 IPC 契约；已保存的历史 session `resumeSession` 后会多挂载一个 MCP server，但不会影响已有 tool call 历史。
- **Non-goals**（留待后续 change）：
  - 用户自定义 MCP 的合并（归 `integration-custom-mcp`）。
  - `fyllo-cortex` MCP server 的设计与实现。
  - 对 Claude Code 以外 ACP agent 的 MCP 兼容性测试。

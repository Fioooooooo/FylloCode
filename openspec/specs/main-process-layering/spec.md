# main-process-layering 规范

## Purpose

定义 `src/main/` 的五层结构（`bootstrap → ipc → services → {domain, infra}`）、单向依赖方向、资源生命周期与进程内实现约束，使主进程在功能增长时仍保持可维护、可测试、可安全退出。本 spec 由 ESLint layering guard（`eslint.config.mjs`）与 `test/main/**` 共同守护；当依赖方向、目录职责或基础设施约束变化时同步更新。

## Requirements

### Requirement: 主进程采用五层分层架构

`src/main/` 目录 SHALL 采用五层分层结构：`bootstrap/`、`ipc/`、`services/`、`domain/`、`infra/`，每层职责边界明确，不得越层或混合职责。

#### Scenario: 目录结构完整性

- **WHEN** 检查 `src/main/` 顶层目录
- **THEN** 存在且仅存在 `bootstrap/`、`ipc/`、`services/`、`domain/`、`infra/` 五个业务目录和 `index.ts` 入口文件
- **AND** 不存在 `chat-agent/`、`cli/`、`utils/`、`workflows/` 等历史遗留顶层目录

#### Scenario: 入口文件只做启动引导

- **WHEN** 查看 `src/main/index.ts`
- **THEN** 文件仅导入并调用 `bootstrap` 模块，不包含窗口创建、IPC 注册、子进程启动等具体逻辑

### Requirement: 分层依赖方向单向且可通过静态检查

依赖方向 SHALL 满足：`ipc → services → {domain, infra}`，`domain → shared`，`infra → {shared, 第三方 npm}`，`bootstrap → {ipc, services, infra}`。反向依赖、跨层依赖、循环依赖均禁止。

#### Scenario: domain 层不依赖 electron

- **WHEN** 检查任意 `src/main/domain/**/*.ts` 文件的 import 列表
- **THEN** 不存在 `from "electron"` 或 `from "@electron-toolkit/*"` 或 `from "@main/infra/*"` 或 `from "@main/services/*"` 的 import

#### Scenario: ipc 层不直接使用 fs / child_process

- **WHEN** 检查任意 `src/main/ipc/**/*.ts` 文件的 import 列表（`_kit/` 除外）
- **THEN** 不存在 `from "fs"`、`from "node:fs"`、`from "child_process"`、`from "node:child_process"`、`from "path"` 的 import
- **AND** 不直接实例化 `AcpSession`、`MessageChannelMain`、`spawn`

#### Scenario: ESLint 守护分层

- **WHEN** 在 `ipc/` 目录下引入 `services/**/internal/*` 或 `domain/*` 路径
- **THEN** ESLint 的 `no-restricted-imports` 规则报错并阻断构建

### Requirement: IPC handler 零业务逻辑

`src/main/ipc/**/*.ts`（`_kit/` 除外）中的每个 handler 函数体 SHALL 仅包含三类操作：参数校验（通过 `_kit/schema.ts`）、调用 service 方法、将结果通过 `wrapHandler` 或 `makeStreamChannel` 归一化为 IPC 响应。禁止在 handler 内部读写文件、拼接路径、实例化会话对象、构造 prompt、解析 YAML 等业务行为。

#### Scenario: handler 仅编排三步

- **WHEN** 审查任意 IPC handler 的函数体
- **THEN** 可以清晰看到 "validate → call service → return wrapped response" 三个步骤
- **AND** handler 函数体不包含业务编排、状态机、循环或持久化逻辑——这些 SHALL 下沉到 `services/`；流式 handler 的 `onReady` 仅做依赖装配并返回 `StreamRunner`，不内联事件处理逻辑

> 说明：早期 spec 设有「handler ≤ 20 行」的硬指标，但对 MessagePort 流式握手场景不现实（`onReady` 需装配 session/assembler/sink），导致该指标长期被违反而失效。现改为定性约束「零业务编排」，更贴合可执行的真实边界；流式 handler 的去重（抽取 `buildAcpStreamRunner`）作为落实手段单独推进。

#### Scenario: 业务样板不重复

- **WHEN** 检查所有 IPC handler
- **THEN** 不存在多处重复的 `resolveProjectPath`、`resolveChangeDir`、`createXxxError` 实现；这些逻辑必须下沉到 `services/` 或 `_kit/`

### Requirement: 共享基础设施通过 `ipc/_kit/` 单点提供

IPC 层共享基础设施（错误构造、请求校验、请求-响应包装、流式协议封装）SHALL 集中在 `src/main/ipc/_kit/` 下，包括 `wrap-handler.ts`、`stream-channel.ts`、`errors.ts`、`schema.ts`。其他 IPC 模块不得自行实现等价功能。

#### Scenario: `_kit` 模块集合完整

- **WHEN** 查看 `src/main/ipc/_kit/` 目录
- **THEN** 存在 `wrap-handler.ts`、`stream-channel.ts`、`errors.ts`、`schema.ts` 四个文件

#### Scenario: 错误构造单一来源

- **WHEN** 需要构造 IPC 可回传的业务错误
- **THEN** 通过 `ipc/_kit/errors.ts` 导出的 `ipcError(code, message)` 构造
- **AND** 代码库中不存在任何 `createXxxError`、`Object.assign(new Error(), { code })` 之类的自造实现

### Requirement: 活跃 ACP 会话通过统一注册中心管理

所有由主进程创建的 `AcpSession` 实例 SHALL 通过 `services/chat/session-registry.ts` 导出的 `SessionRegistry` 单例注册、取消和枚举，不得在 module scope 维护活跃会话 `Map`。

#### Scenario: 注册中心唯一

- **WHEN** 在代码库中搜索 `new Map<string, AcpSession>()`
- **THEN** 仅在 `services/chat/session-registry.ts` 内部出现一次

#### Scenario: 按 owner 分桶

- **WHEN** chat 业务和 proposal-apply 业务同时注册会话
- **THEN** SessionRegistry 通过 `owner: "chat" | "apply" | "archive"` 将会话隔离到不同命名空间，相同 key 不冲突

### Requirement: 长期运行资源通过 lifecycle 注册为 disposable

`bootstrap/lifecycle.ts` SHALL 提供 `registerDisposable(d: Disposable)` 与 `disposeAll()` API。任何在主进程持续存在的资源（子进程池、会话注册中心、定时器、文件监听、registry 刷新 promise）必须注册为 disposable。应用退出时 `app.on("before-quit")` 调用 `disposeAll()` 按逆序释放。

`disposeAll()` 单个 disposable 的总超时 SHALL 为 8 秒（不再是 5 秒），以容纳 ACP 进程池的 graceful close → SIGTERM grace → SIGKILL 三段级联清理。超时后该 disposable 被跳过，剩余 disposable 继续按逆序释放。

#### Scenario: before-quit 有序释放

- **WHEN** 用户执行 Cmd+Q 或 `app.quit()` 触发 `before-quit`
- **THEN** bootstrap 拦截默认行为，按注册逆序 await 每个 disposable 的 `dispose()`
- **AND** 全部完成后或单 disposable 8 秒超时后调用 `app.exit(0)`

#### Scenario: ACP 进程池可释放（释放整棵进程树）

- **WHEN** `disposeAll()` 执行到 acp-process-pool 的 disposable
- **THEN** pool 内每个 entry 先经 `connection.closeSession()`（每个 session 上限 300ms）与 `child.stdin.end()` 触发 graceful 退出，并等待 child `close` 事件（最多 500ms）
- **AND** 在 POSIX 平台（macOS / Linux），随后调用 `process.kill(-child.pid, "SIGTERM")` 对该 entry 所在的 process group 整组发送终止信号，等待 500ms 后若进程仍存在，则调用 `process.kill(-child.pid, "SIGKILL")` 强制终止整组
- **AND** 在 Windows 平台，跳过 SIGTERM/SIGKILL 阶段，改为 `child_process.spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"])` 递归终止整棵子进程树
- **AND** 上述清理完成后，pool 内所有 ACP agent 直接子进程及其派生的 MCP 孙进程 SHALL NOT 在系统进程列表中残留
- **AND** 所有清理动作被 `try/catch` 包裹，单 entry 清理失败仅 `logger.warn` 记录，不阻塞其他 entry 的清理
- **AND** `process.kill` 抛出 `ESRCH`（进程已不存在）SHALL 被视为成功并吞掉

#### Scenario: 退出窗口期不再触发自动重启

- **WHEN** `disposeAll()` 进入 acp-process-pool 的 dispose 流程
- **THEN** 模块内部的 `shuttingDown` 标志被置为 true
- **AND** 即便 child 在退出窗口期触发 `exit` 事件，pool 也 SHALL NOT 启动 backoff 重启逻辑

### Requirement: ACP 子进程池使用 backoff 重启并具备 give-up 阈值

`infra/process/acp-process-pool.ts` 对子进程非正常退出 SHALL 采用指数 backoff 重启（例如 `[0, 500, 2000, 5000]` ms），超过配置的尝试上限后标记 `giveUp` 并停止重启，同时通过 IPC 事件 `acp:event:agentUnavailable` 广播给渲染进程。进入 `giveUp` 状态的 agent 下次 `getOrStartProcess` 必须返回 `ACP_EXIT_GIVEUP` 错误。

#### Scenario: 首次退出立即重启

- **WHEN** ACP 子进程首次退出
- **THEN** pool 按 backoff 序列的第一个间隔重启（0ms）

#### Scenario: 反复退出后放弃

- **WHEN** ACP 子进程连续退出达到 backoff 序列长度
- **THEN** pool 停止重启，广播 `acp:event:agentUnavailable`，并在后续 `getOrStartProcess` 调用中抛出 `ACP_EXIT_GIVEUP`

#### Scenario: stderr 进入日志系统

- **WHEN** ACP 子进程在 stderr 输出内容
- **THEN** 主进程通过 pipe 读取并以 `warn` 级别写入统一日志，携带 `agentId` tag

### Requirement: 存储路径通过 infra 层单点函数获取

项目作用域的持久化目录（sessions、apply-runs、workflows 等）SHALL 通过 `infra/storage/project-paths.ts` 导出的函数获取，例如 `sessionsDir(projectPath)`、`applyRunsDir(projectPath)`、`workflowsDir(projectPath)`、`projectDir(projectPath)`。`services/` 与 `ipc/` 层禁止直接使用 `encodeProjectPath` + `join` 拼装路径。

#### Scenario: 路径工厂唯一

- **WHEN** 在代码库中搜索 `encodeProjectPath(`
- **THEN** 调用仅出现在 `infra/storage/` 和 `services/project/` 内部

#### Scenario: 新增持久化子目录

- **WHEN** 新增一个项目作用域持久化子目录
- **THEN** 在 `infra/storage/project-paths.ts` 中新增对应的 `xxxDir(projectPath)` 导出函数，`services/` 通过此函数消费

### Requirement: ID 生成通过 infra/ids 单点提供

所有主进程生成的业务 ID（session id、apply run id、stage fyllo session id 等）SHALL 通过 `infra/ids.ts` 导出的工厂函数生成，禁止在 service 或 handler 中直接使用 `Date.now()`、`Math.random()`、字符串拼接生成 ID。

#### Scenario: sessionId 工厂唯一来源

- **WHEN** service 需要新建一个 chat session
- **THEN** 通过 `newSessionId()` 获取 ID
- **AND** 代码库中不存在 `` `session-${Date.now()}` `` 或等价拼接

#### Scenario: runId 工厂唯一来源

- **WHEN** proposal apply 需要新建一次 run
- **THEN** 通过 `newRunId()` 获取 ID

### Requirement: 默认值通过 src/shared/constants 集中声明

跨模块复用的默认值（默认 session 标题、UI 常量等）SHALL 集中定义在 `src/shared/constants/` 下对应的文件中，禁止在多处 handler / service 里硬编码相同字符串。

主进程 SHALL NOT 维护系统级 "默认 ACP agentId"。`agentId` 是会话/请求级别的必要参数，必须由调用方在请求边界显式提供。具体地：

- `createSessionInputSchema.agentId` SHALL 为 `z.string().min(1)`（必填），缺失时由 schema validate 阶段抛 `VALIDATION_ERROR`。
- `chat.streamMessage` handler 在 `inputAgentId` 与持久化 `meta.agentId` 都为空时 SHALL 抛 `VALIDATION_ERROR("agentId is required")`，不得回退到任何系统级默认值。
- `proposal.stageStream` handler 在 `stage.agent` 为空时 SHALL 抛 `VALIDATION_ERROR("stage.agent is required for stage ${stageIndex}")`，不得回退到任何系统级默认值。

代码库中 SHALL NOT 存在面向"未指定 agent 时的兜底 agentId"用途的共享常量；具体来说，`src/shared/constants/agents.ts` 与导出符号 `DEFAULT_ACP_AGENT_ID` SHALL 被移除。

#### Scenario: 不存在系统级默认 agentId 常量

- **WHEN** 在代码库中搜索字符串字面量 `"claude-acp"` 或符号 `DEFAULT_ACP_AGENT_ID`
- **THEN** 在 `src/shared/`、`src/main/`、`src/preload/`、`src/renderer/` 的产品代码中均无该字面量或符号引用
- **AND** 文件 `src/shared/constants/agents.ts` 不存在

#### Scenario: createSession 缺 agentId 直接拒绝

- **WHEN** IPC 调用 `chat.createSession` 时 `input.agentId` 缺失或为空字符串
- **THEN** schema 校验抛 `VALIDATION_ERROR`
- **AND** 不创建任何 SessionMeta

#### Scenario: streamMessage 缺 agentId 直接拒绝

- **WHEN** IPC 调用 `chat.streamMessage` 时 `inputAgentId` 缺失且持久化的 `meta.agentId` 也为空
- **THEN** handler 抛 `VALIDATION_ERROR("agentId is required")`
- **AND** 不创建 `AcpSession` 实例

#### Scenario: stageStream 缺 stage.agent 直接拒绝

- **WHEN** IPC 调用 `proposal.stageStream` 时所选 stage 的 `agent` 字段为空
- **THEN** handler 抛 `VALIDATION_ERROR("stage.agent is required for stage ${stageIndex}")`
- **AND** 不创建 `AcpSession` 实例

### Requirement: 日志统一通过 infra/logger

所有主进程模块 SHALL 通过 `@main/infra/logger` 默认导出的 logger 记录日志（该 logger 基于 `electron-log` 封装，统一处理 dev/prod 路径、级别与渲染进程转发），不得使用散落的 `console.log`。日志消息 SHOULD 以 `[模块]` 形式的前缀标注来源（例如 `[chat]`、`[infra.process.acp]`、`[proposal-apply]`），便于过滤。

> 历史说明：早期 spec 曾设想 `infra/logger/create-logger.ts` 的 `createLogger(tag)` 工厂，但该接口从未落地；当前实现为单一默认 logger + 手写 `[模块]` 前缀，本条已据实校准。若未来引入 tag 工厂，应同步更新本条与调用点。

#### Scenario: 统一 logger 来源

- **WHEN** 主进程任意模块需要记录日志
- **THEN** 通过 `import logger from "@main/infra/logger"` 获取实例并调用 `logger.info(...)` 等方法
- **AND** 代码库中不存在主进程业务代码直接调用 `console.log`

#### Scenario: 日志前缀一致

- **WHEN** 审查主进程模块的日志调用
- **THEN** 消息以 `[模块]` 前缀标注来源，前缀与模块物理层级大致对应（如 `[services.chat.stream]` 或 `[chat]`）

### Requirement: cli/claude 目录移除

`src/main/cli/claude/` 目录 SHALL 被完全删除，其实现已被 ACP 方案取代，代码库中不得保留任何引用。

#### Scenario: 目录不存在

- **WHEN** 检查 `src/main/cli/` 目录
- **THEN** 该目录不存在

#### Scenario: 无引用残留

- **WHEN** 在代码库中搜索 `ClaudeSession`、`spawnClaude`、`cli/claude`
- **THEN** 仅在 `openspec/changes/archive/` 的历史 change 中出现，`src/main/`、`src/preload/` 与 `src/renderer/` 下无任何引用

### Requirement: 主进程核心模块具备单元测试

`domain/`、`infra/` 下的纯函数模块，以及 `services/chat/session-registry.ts`、`ipc/_kit/stream-channel.ts` SHALL 具备 Vitest 单元测试。测试文件 SHALL 统一放置在 `test/main/` 下，并按源码目录镜像组织（例如 `test/main/ipc/_kit/stream-channel.spec.ts`）。`pnpm test` 需能在不启动 Electron 的情况下运行并通过。

#### Scenario: 测试文件位置

- **WHEN** 查看 `src/main/ipc/_kit/stream-channel.ts` 所在目录
- **THEN** 存在 `test/main/ipc/_kit/stream-channel.spec.ts` 测试文件

#### Scenario: 测试可脱离 Electron 运行

- **WHEN** 执行 `pnpm test`
- **THEN** 测试在 Node 环境下直接运行
- **AND** 涉及 electron API 的模块通过依赖注入或 mock 被替换

### Requirement: 应用随附资源路径通过 infra/paths 单点获取

主进程读取随应用分发的根目录 `resources/` 内容时，SHALL 通过 `src/main/infra/paths` 导出的资源目录函数获取 `resources/` 目录位置。`services/`、`ipc/`、`bootstrap/` 等层不得直接假设 `process.resourcesPath`、`app.getAppPath()` 或 `app.asar.unpacked` 的具体打包布局来定位 `resources/`。

#### Scenario: service 读取随附资源

- **WHEN** service 需要读取 `resources/workflows/built-in/` 中的内置 workflow 文件
- **THEN** service 先通过 `infra/paths` 获取 `resources/` 目录位置
- **AND** service 仅在该目录基础上拼接业务子路径 `workflows/built-in`

#### Scenario: 打包布局差异由 infra 层处理

- **WHEN** 应用在生产环境运行
- **THEN** `infra/paths` 负责处理 `app.asar.unpacked/resources/`、`app.asar/resources/` 或等价 packaged resources 位置
- **AND** 调用方无需直接拼接这些 Electron 打包布局路径

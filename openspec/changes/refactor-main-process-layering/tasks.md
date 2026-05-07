## 1. Phase 0 — 清理与对齐（无行为变化）

- [x] 1.1 删除 `electron/main/cli/claude/` 整个目录（`session.ts` / `session-map.ts` / `process.ts` / `parser.ts` / `mapper.ts` / `types.ts`），并在代码库全局搜索 `ClaudeSession` / `spawnClaude` / `cli/claude` 确认无引用残留
- [x] 1.2 `electron/preload/index.ts:30` 将 `console.error(error)` 替换为通过 `electron-log` 的 preload 入口写日志（沿用现有 logger 规范），或至少改为调用 `electronAPI.ipcRenderer` 发送给主进程 logger
- [x] 1.3 在 `openspec/specs/ipc-protocol/` 等受影响 spec 的 Requirement 上检索实际代码现状，记录与本次重构相关的偏差（仅用于 Phase 2 迁移时作为回归基准，不修改文件）
- [x] 1.4 运行 `pnpm typecheck && pnpm lint && pnpm build` 基线验证并记录；运行 `pnpm dev` 手工冒烟（启动 → 切项目 → 聊天一条 → apply 一个 stage → archive → 退出），确保重构前行为作为 golden 基线

## 2. Phase 1 — 建立 IPC kit 与共享常量

- [x] 2.1 新增 `shared/constants/error-codes.ts`，声明 `IpcErrorCodes` 常量对象与 `IpcErrorCode` 联合类型（按 design.md §5 清单）
- [x] 2.2 `shared/types/ipc.ts` 中 `IpcResponse.error.code` 类型收紧为 `IpcErrorCode`（保持字符串值兼容，仅加类型约束）
- [x] 2.3 新增 `shared/constants/agents.ts`，导出 `DEFAULT_ACP_AGENT_ID = "claude-acp"`
- [x] 2.4 新增 `electron/main/ipc/_kit/errors.ts`，导出 `ipcError(code: IpcErrorCode, message: string)`；替换 `ipc/chat.ts`、`ipc/proposal.ts`、`ipc/proposal-apply.ts`、`ipc/workflow.ts`、`ipc/acp-agents.ts` 中所有 `createSessionError` / `createError` / `createWorkflowError` / `createAgentError` / 就地 `Object.assign(new Error(), { code })` 调用
- [x] 2.5 `electron/main/ipc/utils.ts` 迁移为 `electron/main/ipc/_kit/wrap-handler.ts`，保持现有行为；删除原 `utils.ts`（或保留 re-export 一个版本内，Phase 2 删除）
- [x] 2.6 安装 `zod` 作为生产依赖（`pnpm add zod`）；在 `electron.vite.config.ts` 的 main 入口 external 中视情况排除
- [x] 2.7 新增 `electron/main/ipc/_kit/schema.ts`，导出 `validate<T>(schema, input): T`，校验失败抛出带 `VALIDATION_ERROR` 的错误，由 `wrapHandler` 归一化
- [x] 2.8 为每个 IPC 域新增 `shared/schemas/ipc/<domain>.ts`（chat/project/proposal/workflow/integration/settings/window/net/acp-agents），按 handler 当前入参字段定义 zod schema
- [x] 2.9 在 `electron/main/ipc/*.ts` 所有非流式 handler 入口加 `validate(schema, input)` 调用，确认 renderer 异常入参返回 `VALIDATION_ERROR`
- [x] 2.10 新增 `electron/main/services/chat/session-event-mapper.ts`，将 `AcpSession` 的 `SessionEvent` 映射为 `MessageChunkData`（合并现有 `chat.ts` switch 与 `proposal-apply.ts` `toChunkData`，至少覆盖 `text_delta` / `tool_call_start` / `tool_call_update` / `session_info_update` / `done` / `error` / `session_id_resolved`）
- [x] 2.11 新增 `electron/main/ipc/_kit/stream-channel.ts`，导出 `makeStreamChannel<TOwnerMeta>({ event, portChannel, onReady, mapEvent })`，实现 design.md §2 描述的 ready 握手、portClosed 守卫、done/error 归一
- [x] 2.12 重写 `ipc/chat.ts` 的 `ChatStreamChannels.streamMessage` 改用 `makeStreamChannel`
- [x] 2.13 重写 `ipc/proposal-apply.ts` 的 `ProposalChannels.stageStream` 改用 `makeStreamChannel`
- [x] 2.14 重写 `ipc/proposal-apply.ts` 的 `ProposalChannels.archive` 改用 `makeStreamChannel`
- [x] 2.15 补齐 `archive` 路径对 `session_info_update` 的处理（参照 chat 路径），消除三处 stream handler 事件集差异
- [x] 2.16 运行 `pnpm typecheck && pnpm lint && pnpm build`；手工冒烟：chat 发一条、apply 跑一个 stage、archive 跑完、全程观察 `data/logs/main.log` 无异常

## 3. Phase 2 — 目录重排（物理搬家）

- [x] 3.1 主进程内部分层沿用 `@main/*` 一等 alias（`tsconfig.node.json` 与 `electron.vite.config.ts` 已存在），所有跨层 import 使用 `@main/bootstrap/*`、`@main/services/*`、`@main/domain/*`、`@main/infra/*` 子路径；不引入 `@bootstrap`/`@services`/`@domain`/`@infra` 一等 alias
- [x] 3.2 新增 `electron/main/infra/paths/index.ts`：将 `utils/paths.ts` 整体迁入；原路径保留一周兼容层（re-export），在本 Phase 结束删除
- [x] 3.3 新增 `electron/main/infra/logger/create-logger.ts`：保留 `utils/logger.ts` 的 electron-log 初始化逻辑 + 新增 `createLogger(tag)` 工厂；更新下游 import 路径到 `@main/infra/logger`
- [ ] 3.4 新增 `electron/main/infra/storage/project-paths.ts`：导出 `projectDir` / `sessionsDir` / `applyRunsDir` / `workflowsDir` / `integrationsDir` 等函数，内部封装 `encodeProjectPath`
- [x] 3.5 新增 `electron/main/infra/storage/project-store.ts`：将 `services/project-store.ts` 迁入；并拆出纯持久化函数（`saveProject` / `loadProject` / `listProjects` / `deleteProject` / `encodeProjectPath`）
- [ ] 3.6 新增 `electron/main/services/project/project-service.ts`：承接 `project-store.ts` 中含有 `expandHomePath` / `toProjectInfo` / 默认行为补全等语义的函数
- [x] 3.7 迁移 `chat-agent/acp-process-pool.ts` → `infra/process/acp-process-pool.ts`；`chat-agent/acp-session.ts` → `services/chat/acp-session.ts`；`chat-agent/message-assembler.ts` → `domain/chat/message-assembler.ts`；`chat-agent/acp-mapper.ts` → `services/chat/acp-mapper.ts`；`chat-agent/session-store.ts` → `infra/storage/session-store.ts`；`chat-agent/types.ts` → `domain/chat/session-events.ts`；删除空 `chat-agent/` 目录
- [x] 3.8 迁移 `acp/registryCache.ts` → `services/acp-agent/registry-cache.ts`；`acp/iconCache.ts` → `services/acp-agent/icon-cache.ts`；`acp/installer.ts` → `services/acp-agent/installer.ts`；`acp/detector.ts` → `domain/acp/detector.ts`（split：pure utils 放 domain，需 electron 的 broadcast 放 services）；更新所有 import
- [x] 3.9 迁移 `integrations/yunxiao/client.ts` → `domain/integration/yunxiao/client.ts`；`integrations/yunxiao/{organization,codeup,projex}/` → `domain/integration/yunxiao/`；`integrations/yunxiao/credentials/` → `infra/storage/yunxiao-credentials.ts`；`services/integrations/yunxiao.ts` → `services/integration/yunxiao-service.ts`；`services/integrations/connections.ts` → `infra/storage/connections-store.ts`
- [x] 3.10 迁移 `workflows/index.ts` → `services/workflow/built-in-loader.ts`；`workflows/built-in/quick-apply.yaml` 保持路径或迁至 `services/workflow/built-in/`（随 `built-in-loader.ts` 的相对路径）
- [x] 3.11 迁移 `ipc/proposal-apply/apply-run-store.ts` → `infra/storage/apply-run-store.ts`
- [x] 3.12 迁移 `ipc/proposal-apply/stage-runners.ts` → `services/proposal/stage-prompts.ts`
- [ ] 3.13 拆解 `ipc/proposal-apply.ts`：业务编排（resolveChangeDir、updateChangeStatus、loadWorkflowTemplates、findWorkflowTemplate、apply/stageStream/archive 的业务体）全部下沉到 `services/proposal/apply-run-service.ts` 和 `services/proposal/archive-service.ts`；handler 只保留 "validate → call service → return"
- [ ] 3.14 拆解 `ipc/proposal.ts`：`readProposalFiles` / `parseYamlStatus` / `parseWhySummary` / `countTasks` / `resolveChangeDir` 全部下沉到 `domain/proposal/openspec-reader.ts` 与 `services/proposal/proposal-service.ts`；handler 只保留编排壳
- [ ] 3.15 拆解 `ipc/workflow.ts`：`parseWorkflowYaml` / `readWorkflowDirectory` / `normalizeWorkflowName` 等下沉到 `domain/workflow/yaml-parser.ts` 与 `services/workflow/workflow-service.ts`；handler 只保留壳
- [ ] 3.16 拆解 `ipc/chat.ts`：`resolveProjectPath` / `toSession` 等下沉到 `services/chat/chat-service.ts`；handler 只保留 validate + call + wrap
- [ ] 3.17 拆解 `ipc/integration.ts`、`ipc/acp-agents.ts`、`ipc/project.ts`、`ipc/settings.ts`、`ipc/window.ts`、`ipc/net.ts` 中的业务逻辑，下沉到各自 `services/<domain>/*-service.ts`
- [x] 3.18 删除历史遗留顶层目录 `electron/main/chat-agent/`、`electron/main/acp/`、`electron/main/integrations/`、`electron/main/utils/`、`electron/main/cli/`（若未在 Phase 0 删尽）、`electron/main/workflows/`、`electron/main/services/project-store.ts`（迁到 infra）
- [x] 3.19 运行 `pnpm typecheck && pnpm lint && pnpm build`；手工冒烟：完整走一遍冒烟链路，对比 `data/logs/main.log` 与 Phase 0 baseline 差异

## 4. Phase 3 — 生命周期与会话治理

- [ ] 4.1 新增 `electron/main/bootstrap/lifecycle.ts`：`Disposable` 接口 + `registerDisposable` + `disposeAll`（逆序 await，5s 超时兜底）
- [ ] 4.2 新增 `electron/main/bootstrap/window.ts`：将 `index.ts` 的 `createWindow` 逻辑迁入
- [ ] 4.3 新增 `electron/main/bootstrap/index.ts`：整合 `app.whenReady` / `before-quit` / `window-all-closed` / `activate` 流程；`before-quit` 中 `preventDefault()` + `await disposeAll()` + `app.exit(0)`
- [ ] 4.4 `electron/main/index.ts` 精简为 `import "./bootstrap"` 启动引导
- [ ] 4.5 新增 `electron/main/services/chat/session-registry.ts`：实现 `SessionRegistry`（`register` / `get` / `cancel` / `cancelByOwner` / `cancelAll`），owner 类型为 `"chat" | "apply" | "archive"`
- [ ] 4.6 `services/chat/acp-session.ts` 暴露 `dispose()` 用于解绑事件订阅（供 registry 调用）
- [ ] 4.7 迁移 `ipc/chat.ts` 中的 `activeSessions`、`ipc/proposal-apply.ts` 中的 `activeApplySessions` / `activeArchiveSessions` 到 `SessionRegistry`；对应 service 方法接收 registry 作为依赖
- [ ] 4.8 `SessionRegistry` 注册为 disposable（dispose 时 cancelAll）
- [ ] 4.9 `infra/process/acp-process-pool.ts` 加 exponential backoff（序列 `[0, 500, 2000, 5000]`），超过上限后标记 giveUp，下次 `getOrStartProcess` 抛 `ACP_EXIT_GIVEUP`
- [ ] 4.10 新增 `acp:event:agentUnavailable` 事件 channel（在 `shared/types/channels.ts` 中登记）；pool 在 giveUp 时广播
- [ ] 4.11 acp pool 的 `stdio` 从 `["pipe", "pipe", "inherit"]` 改为 `["pipe", "pipe", "pipe"]`，将 stderr 按行接管到 `createLogger("infra.process.acp").warn({ agentId }, line)`
- [ ] 4.12 `acp-process-pool` 注册为 disposable（dispose 时对所有 child 发送 kill 并等待 exit，然后清空 pool）
- [ ] 4.13 全局搜索 `logger` 直接 import，替换为 `createLogger("<domain>.<sub>")`；tag 命名遵循 design.md §7
- [ ] 4.14 运行 `pnpm typecheck && pnpm lint && pnpm build`；手工冒烟重点：`Cmd+Q` 优雅退出、ACP 子进程被意外 kill 后能 backoff 重启、多次 kill 后 giveUp 并前端收到 `agentUnavailable`

## 5. Phase 4 — 测试与 ESLint 约束

- [ ] 5.1 安装测试依赖若缺失（`vitest` 已有），确认 `vitest.config.mts` 能覆盖 `electron/main` 下的 `*.spec.ts`
- [ ] 5.2 为 `domain/chat/message-assembler.ts` 补单测（text_delta 累积、tool_call_start/update 状态迁移、flush 语义）
- [ ] 5.3 为 `domain/workflow/yaml-parser.ts` 补单测（stage type alias、缺失字段默认值、异常 YAML）
- [ ] 5.4 为 `domain/proposal/openspec-reader.ts` 补单测（Why 摘要、任务计数、archive 目录合并）
- [ ] 5.5 为 `domain/acp/detector.ts` 中的纯函数（`compareVersions` / `resolveBinaryDistribution` / `parseVersionFromText`）补单测
- [ ] 5.6 为 `infra/storage/project-paths.ts` 补单测（encode 稳定、各子目录函数）
- [ ] 5.7 为 `infra/ids.ts` 补单测（前缀格式、单调性）
- [ ] 5.8 为 `services/chat/session-event-mapper.ts` 补单测（每种 SessionEvent 到 MessageChunkData 的映射完整性）
- [ ] 5.9 为 `services/chat/session-registry.ts` 补单测（注册/取消/按 owner cancel/cancelAll 覆盖不存在 key）
- [ ] 5.10 为 `ipc/_kit/stream-channel.ts` 补单测：ready 握手、未 ready 时不启动业务、业务 throw 归一化为 error、port 关闭时 cancel 被调用、done 正常发送、重复 done/error 幂等
- [ ] 5.11 为 `ipc/_kit/errors.ts` 补单测：code 必须属于 `IpcErrorCodes`
- [ ] 5.12 `eslint.config.mjs` 新增 `no-restricted-imports` 约束：
  - `domain/**` 禁止 `electron` / `@electron-toolkit/*` / `@main/services/*` / `@main/infra/*` / `@main/ipc/*`
  - `ipc/**`（除 `_kit/**`）禁止 `node:fs` / `fs` / `child_process` / `node:child_process` / `path`（`path.join` 走 infra）/ 直接 `new MessageChannelMain`
  - `services/**` 禁止 `electron/ipcMain`（`ipcMain` 只在 ipc 层用）
- [ ] 5.13 将 `pnpm test` 纳入本 change 的验证清单；CI 未配置时本 change 不引入 CI 变动，仅确认本地可跑

## 6. Phase 5 — 文档与规范落地

- [ ] 6.1 新增 `docs/MainProcess.md`：完整描述 bootstrap / ipc / services / domain / infra 五层职责、依赖方向、`_kit` 使用约定、SessionRegistry 用法、disposable 注册流程、路径 / ID / logger tag 单点规则；并给出"新增一个 IPC 方法"的 step-by-step
- [ ] 6.2 更新 `docs/Architecture.md` 中"Electron 进程规范"章节，替换旧的 `main/index.ts` 直接负责 IPC 监听的描述，引用 `MainProcess.md`
- [ ] 6.3 更新 `docs/IPC.md`：新增"handler 实现约束"章节（必须用 `wrapHandler` / `makeStreamChannel`）、新增"错误码清单"章节（指向 `shared/constants/error-codes.ts`）、新增"入参 schema"章节
- [ ] 6.4 更新 `CLAUDE.md` 的"文档归类"链接表，新增 `MainProcess` 一行
- [ ] 6.5 最终运行 `openspec validate refactor-main-process-layering --strict` 通过
- [ ] 6.6 最终运行 `pnpm typecheck && pnpm lint && pnpm build && pnpm test` 全绿
- [ ] 6.7 最终手工冒烟回归：项目列表 → 进入项目 → 新建 chat session → 发消息走流式 → 打开 proposal → apply 一个 stage → archive → 切换其他 project → 连接/断开 yunxiao → Cmd+Q 优雅退出；对比 `data/logs/main.log` 与 Phase 0 baseline 无回归

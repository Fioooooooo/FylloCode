## Context

`electron/main/` 的演进是典型的"功能驱动，结构滞后"——chat、proposal-apply、workflow、integration 等特性以各自节奏落地，没有沉淀共享基础设施，造成当前：

- IPC handler 层混入大量业务编排（`proposal-apply.ts` 单文件 585 行），流式协议三处重复实现并已发生漂移；
- `services/` 目录只放了 `project-store` 和 `integrations` 的薄壳，ACP 会话、workflow、proposal 编排散落各处；
- 会话和子进程生命周期由多处 module-level `Map` 各自维护，应用退出时无统一 shutdown 路径；
- `electron/main/cli/claude/` 是已被 ACP 取代的僵尸代码；
- 0 单元测试，handler 直接依赖 `ipcMain`、`fs`、`spawn`、`app`，无注入点。

技术栈与约束：

- Electron 39 + electron-vite 5（main/preload/renderer 三套 tsconfig）；
- TypeScript 6，`@electron-toolkit/eslint-config-ts` 严格模式；
- `@agentclientprotocol/sdk` 是 ACP 通信基础；
- Vitest + happy-dom 已配置但未被主进程代码使用；
- 持久化数据位于 `data/`（开发）/ `userData/`（生产），文件 schema 已稳定，不能动。

利益相关方：本次重构的受益者是后续所有主进程开发，迁移期间渲染进程完全无感知。

## Goals / Non-Goals

**Goals:**

1. 建立并落地"bootstrap / ipc / services / domain / infra"四层架构，依赖方向单向。
2. 通过 `ipc/_kit/` 把 `wrapHandler`、`makeStreamChannel`、错误码、zod 校验抽成唯一入口，消除三处流式协议重复实现。
3. 统一会话注册与子进程池生命周期，提供 `before-quit` 干净退出能力。
4. 路径 / ID / 默认值 / logger tag 全部单点化。
5. 为 domain / infra / services 的纯函数和可注入模块建立测试基线（Vitest）。
6. 全程保持 IPC channel 名称、preload API 形状、`IpcResponse` 结构、持久化文件格式不变，渲染进程零改动。

**Non-Goals:**

- 不引入 DI 容器（inversify / tsyringe 等）；service 依赖通过构造函数参数显式注入即可。
- 不把 EventEmitter 升级到 RxJS / Observable；保留现有事件语义。
- 不改动 workflow stage prompt 语义或 YAML schema。
- 不做性能优化、不重写 ACP 协议适配；仅在迁移路径上顺便修复 `stderr: inherit` 等诊断黑洞。
- 不动前端代码、preload API 形状、shared/types/channels.ts 里的 channel 字符串。
- 不做国际化改造。

## Decisions

### 1. 分层目录定型为五个顶层目录

```
electron/main/
├── bootstrap/    # 应用生命周期、窗口创建、disposable 注册中心
├── ipc/          # IPC handler（零业务逻辑）+ _kit 共享基础设施
├── services/     # 应用服务：跨领域编排、持久化协调、事件广播
├── domain/       # 领域纯逻辑与契约（无 electron 依赖）
└── infra/        # 基础设施适配器（storage、process、paths、logger、net、ids）
```

**依赖方向（编译期约束）**：`ipc → services`；`services → domain, infra`；`domain → (只能依赖自身和 shared)`；`infra → (只能依赖自身、shared 和第三方 npm 包)`。通过 ESLint `no-restricted-imports` 规则强制。

**为什么不沿用现有 `services/`**：现有 `services/` 混杂 `project-store`（infra 语义）和 `integrations/yunxiao.ts`（service 语义），职责不一致，不如物理重划。

**为什么不引入 monorepo / package 边界**：主进程现有规模（~5k 行）不足以支撑 workspace 拆分，目录 + ESLint 约束的性价比更高。

### 2. `ipc/_kit/` 作为 IPC 层唯一基础设施入口

`_kit/` 下沉四个模块：

- `wrap-handler.ts`：现有 `ipc/utils.ts` 内容搬家 + 泛型加强，要求 handler 必须返回 `Promise<IpcResponse<T>>`。
- `stream-channel.ts`：提供 `makeStreamChannel<TChunk>({ event, portChannel, onReady, mapEvent })`，内部处理 MessagePort 握手、portClosed 守卫、chunk-done-error 封装。
  - `onReady(send)` 返回一个 `AbortableRunner`（`{ start, cancel }`），由 kit 负责在 renderer 发回 `ready` 后 `start()`，并在 port 关闭时 `cancel()`。
  - `mapEvent` 是 `SessionEvent → MessageChunkData` 的映射函数，三处流式 handler 共用 `services/chat/session-event-mapper.ts`。
- `errors.ts`：`IpcErrorCodes` 常量对象 + `ipcError(code, message)` helper；取代 `createSessionError` / `createError` / `createWorkflowError` / `createAgentError` 四份重复实现。
- `schema.ts`：`validate<T>(schema, input)`，zod schema 在 `shared/schemas/ipc/<domain>.ts`。

**为什么不用运行时装饰器**：TS 装饰器需要打开 `experimentalDecorators`，增加构建风险；显式 `wrapHandler(async () => ...)` 同样清晰，且更利于类型推导。

**为什么把 schema 放 shared**：preload 层将来也能复用做乐观校验，且 renderer 端可以基于 schema 生成 TS 类型。

### 3. 会话注册中心（SessionRegistry）

`services/chat/session-registry.ts` 提供：

```ts
type Owner = "chat" | "apply" | "archive";

interface SessionRegistry {
  register(owner: Owner, key: string, session: AcpSession): void;
  get(owner: Owner, key: string): AcpSession | undefined;
  cancel(owner: Owner, key: string): void;
  cancelByOwner(owner: Owner): void;
  cancelAll(): void;
}
```

三处 module-level `Map` 全部合并到同一个 registry 实例；`bootstrap/lifecycle.ts` 在 `before-quit` 调 `cancelAll()`。key 空间按 owner 隔离，避免 chat 的 `sessionId` 与 apply 的 `runId` 碰撞。

**为什么不用单一全局 Map**：不同 owner 的 key 语义不同（sessionId / runId / `projectId:changeId`），强行统一会让 cancel 语义模糊。

### 4. Disposable 生命周期

`bootstrap/lifecycle.ts`：

```ts
interface Disposable {
  name: string;
  dispose(): Promise<void> | void;
}
export function registerDisposable(d: Disposable): void;
export async function disposeAll(): Promise<void>; // 逆序
```

注册者：`acp-process-pool`、`SessionRegistry`、registry refresh promise、file watchers（当前无但预留）。`app.on("before-quit", async (e) => { e.preventDefault(); await disposeAll(); app.exit(0); })`。

**为什么 preventDefault + exit**：保证异步 dispose 能完成；超时兜底 5s 后强制 `app.exit(1)`。

### 5. 错误码联合类型化

`shared/constants/error-codes.ts`：

```ts
export const IpcErrorCodes = {
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  CHAT_SESSION_NOT_FOUND: "CHAT_SESSION_NOT_FOUND",
  PROPOSAL_NOT_FOUND: "PROPOSAL_NOT_FOUND",
  APPLY_RUN_NOT_FOUND: "APPLY_RUN_NOT_FOUND",
  APPLY_RUN_NOT_READY: "APPLY_RUN_NOT_READY",
  APPLY_SESSION_NOT_READY: "APPLY_SESSION_NOT_READY",
  STAGE_NOT_FOUND: "STAGE_NOT_FOUND",
  STAGE_TYPE_NOT_IMPLEMENTED: "STAGE_TYPE_NOT_IMPLEMENTED",
  WORKFLOW_NOT_FOUND: "WORKFLOW_NOT_FOUND",
  INVALID_WORKFLOW_NAME: "INVALID_WORKFLOW_NAME",
  BUILT_IN_WORKFLOW: "BUILT_IN_WORKFLOW",
  PROJECT_REQUIRED: "PROJECT_REQUIRED",
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  ACP_ERROR: "ACP_ERROR",
  ACP_NOT_READY: "ACP_NOT_READY",
  ACP_EXIT_GIVEUP: "ACP_EXIT_GIVEUP",
  APPLY_RUN_PERSIST_FAILED: "APPLY_RUN_PERSIST_FAILED",
  SPAWN_ERROR: "SPAWN_ERROR",
  YUNXIAO_API_ERROR: "YUNXIAO_API_ERROR",
} as const;

export type IpcErrorCode = (typeof IpcErrorCodes)[keyof typeof IpcErrorCodes];
```

`IpcResponse.error.code` 类型收紧为 `IpcErrorCode`。新增错误码走 change 流程。

**为什么保留字符串值兼容**：渲染进程代码里已经在用这些字符串做判断，改值会触发大面积前端改动，超出本次 Non-Goals。

### 6. 子进程池治理

`infra/process/acp-process-pool.ts`（从 `chat-agent/acp-process-pool.ts` 迁移）：

- `stderr` 从 `"inherit"` 改 `"pipe"`，按行转发到 `createLogger("infra.process.acp").warn`，tag 附带 `agentId`。
- 重启策略：`[0, 500, 2000, 5000]` ms 的 backoff，超过 4 次标记 `giveUp`，广播 `acp:event:agentUnavailable`（新增事件 channel），并移出 pool；下次 `getOrStartProcess` 返回 `ACP_EXIT_GIVEUP` 错误。
- `dispose()`：kill 所有 child、等待 exit 事件、清空 pool。

**为什么不引入复杂的 supervisor 树**：当前 agent 数量可控（< 10），手写 backoff + give-up 足够；未来需要时可以升级。

### 7. 路径 / ID / 默认值单点化

- `infra/storage/project-paths.ts`：
  ```ts
  export function projectDir(projectPath: string): string;
  export function sessionsDir(projectPath: string): string;
  export function applyRunsDir(projectPath: string): string;
  export function workflowsDir(projectPath: string): string;
  ```
  内部封装 `encodeProjectPath`，上层禁止直接拼路径。
- `infra/ids.ts`：`newSessionId()` / `newRunId()` / `newStageFylloSessionId(runId, stageIndex)`。
- `shared/constants/agents.ts`：`DEFAULT_ACP_AGENT_ID = "claude-acp"`。
- logger tag 工厂：`createLogger(tag: string)` 返回 `{ debug, info, warn, error }`，每条日志前缀 `[tag]`。

### 8. 渐进式 Phase 顺序

即使在单个 change 内实施，仍按 Phase 分批提交，每个 Phase 可独立 review / 回滚 / 验证：

- **Phase 0**（无行为变化）：删除 `cli/claude/`；`preload/index.ts` 的 `console.error` 改 logger；修正文档。
- **Phase 1**（新增 kit，保留旧路径）：建 `ipc/_kit/`、`shared/constants/error-codes.ts`、`shared/schemas/ipc/*.ts`；让 `chat.ts`、`proposal-apply.ts`、`proposal-apply.ts:archive` 三处流式 handler 切到 `makeStreamChannel`；其余 handler 换 `ipcError` + zod。
- **Phase 2**（目录重排，大批文件搬家 + import 修正）：按目标分层物理搬家，更新 tsconfig paths（新增 `@domain/*`、`@services/*`、`@infra/*`、`@bootstrap/*`），删除 `services/project-store.ts` 在 `services` 下的原位置（迁到 `infra/storage/`）。
- **Phase 3**（会话与进程治理）：引入 `SessionRegistry`、`bootstrap/lifecycle.ts`、acp pool backoff / stderr 接管。
- **Phase 4**（测试与 ESLint 约束）：为 domain / infra 纯函数 + stream-channel + session-registry 补单元测试；加 `no-restricted-imports` 规则守护分层。
- **Phase 5**（文档落地）：新增 `docs/MainProcess.md`，并在 `docs/IPC.md`、`docs/Architecture.md` 中交叉引用。

每个 Phase 对应 tasks.md 里的一个 section，按顺序执行。

### 9. 迁移期类型冲突处理

`shared/types/channels.ts` 既被主进程也被前端消费，搬家不动。主进程内部分层仅通过现有的 `@main/*` alias（`tsconfig.node.json` + `electron.vite.config.ts`）定位到具体的 `@main/bootstrap/*` / `@main/services/*` / `@main/domain/*` / `@main/infra/*` 子目录，不额外引入一等 alias。这样一来：

- 项目的一等 alias 继续按"构建目标 / 进程"分（`@shared`、`@main`、`@preload`、`@renderer`），主进程内部的分层通过物理目录名体现；
- tsconfig、vite config、未来的 `no-restricted-imports` 规则都只维护 `@main/*` 这一条映射；
- ESLint 分层约束写成 `@main/ipc/**` 禁止 import `@main/domain/**` / `@main/infra/**` 等具体前缀，同样清晰。

## Risks / Trade-offs

1. **[大面积文件移动引入 merge 冲突]** → 通过将 Phase 1 和 Phase 2 合并到同一 PR 中，开发期禁止并发的主进程改动；在 main 分支 merge freeze 窗口内完成。
2. **[流式协议统一后语义漂移]** → 先完整对齐三处现有 send/done/error/chunk 行为（含 `session_info_update`）作为 baseline，再切到 kit；新 kit 的 unit test 覆盖 ready 握手、提前关闭、错误路径等边界。
3. **[子进程重启策略变更影响现网用户]** → 保留旧无限重启行为兼容层：第一次发布只加 backoff，不引入 give-up 上限；观察一周后再开启 give-up。tasks.md 按这个顺序拆。
4. **[`before-quit` 改 preventDefault 可能卡退出]** → 提供 5s 超时兜底；QA 必须覆盖 "dev server 运行 → Cmd+Q" 场景。
5. **[ESLint 分层规则落地阻力]** → `no-restricted-imports` 仅对新代码生效（用 `overrides` 限定 paths），历史遗留通过 Phase 2 物理搬家一次性解决；不搞渐进式例外白名单。
6. **[zod 引入增加 renderer 构建体积]** → schema 只 import 到 main；preload 不引入；renderer 若要用，future change 再说。

## Migration Plan

**部署顺序**：单 PR 分 commit 按 Phase 顺序提交，每个 Phase commit 都可独立编译通过 `pnpm build`。

**回滚策略**：

- 本次 change 不引入 DB / 磁盘 schema 变化，持久化文件格式、IPC channel、preload API 全部保持兼容 → **回滚 = revert commit**，无数据迁移。
- 若 Phase 3（子进程治理）线上出问题，可单独 revert Phase 3 系列 commit，Phase 0–2 的分层成果保留。

**验证清单**（每个 Phase 完成后必跑）：

- `pnpm typecheck`、`pnpm lint`、`pnpm build` 全部通过；
- `pnpm test`：新增单测全绿；
- 手工冒烟：启动 app → 列出 projects → 打开一个 project → 新建 chat session → 发一条消息走完流式 → 打开 proposal apply → 走完一个 stage → archive → Cmd+Q 退出不卡住；
- `data/logs/main.log` 无 `console.error` 泄漏、无 `[acp-pool]` 等旧 tag。

## Open Questions

1. **logger tag 命名粒度**：`chat.session` vs `chat/session`？提案里用点号，遵循业界主流（winston、pino），tasks 阶段按这个写。
2. **zod schema 是放 `shared/schemas/ipc/` 还是 `shared/ipc/schemas/`？** 当前 `shared/types/` 已存在，新增 `shared/schemas/` 与其平级更清晰。
3. **ACP give-up 阈值是否需要用户可配？** 暂定硬编码 4 次；待产品确认是否做进 settings，本次不做。

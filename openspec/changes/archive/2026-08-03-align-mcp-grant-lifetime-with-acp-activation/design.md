## Context

FylloCode 在 `createBundledMcpActivation()` 中为一次 ACP lifecycle 请求生成 bundled MCP specs。HTTP 模式把同一个 opaque bearer token 放入该 activation 下全部 bundled server 的 Authorization header；`markAcpSessionActive()` 在 `newSession`、`resumeSession` 或 `loadSession` 成功后把 activation 绑定到 `(agentId, acpSessionId)`，后续 direct prompt 与 MCP 请求复用该连接。

当前 grant 默认使用签发后一小时的硬 TTL。ACP 没有为已建立 MCP client 提供独立的 token refresh 流程，实际 Agent 可能在整个 ACP Session 生命周期持续使用最初的 Authorization header。长任务跨过 TTL 后会在健康连接上收到 401；同一 Agent process 内重新调用 `resumeSession` 即使获得新 `mcpServers`，Agent 也可能继续使用旧 MCP client。近期诊断日志已经确认：新 activation 仍处于 active 时，Agent 请求携带的旧 token 返回 `grant-not-found`。

另一个独立触发器来自 stream cancellation：`StreamState.finalise()` 在 `done/error` 后主动关闭 MessagePort，而 `port1` 的 `close` handler 又无条件调用 runner cancel；`AcpSession.cancel()` 随即调用 `forgetActiveAcpSession()`，把 ACP `session/cancel` 这一 prompt-turn 操作扩大成 activation 撤销。ACP SDK 明确将 `session/cancel` 定义为取消当前 prompt turn，真正释放 Session 的操作是独立的 `session/close`。

本变更涉及 stream、ACP Session 和 MCP grant 三层，但不改变 renderer API、IPC payload、持久化 schema、Workspace descriptor 或 MCP tool contract。

## Goals / Non-Goals

**Goals:**

- 让 production HTTP MCP token 在 ACP activation 存续期间不会因一小时绝对 TTL 失效，并固定使用 `2099-12-31T23:59:59.999Z` 作为 `expiresAt`。
- 将正常 stream 终态、prompt turn cancel 与 ACP Session/activation close 分离。
- 保证 direct prompt、连续多轮和长任务复用当前绑定的 activation/token。
- 保留真正关闭、替换、进程失效、host 停止和应用退出时的即时幂等撤销。
- 保留 hash-only registry、server allowlist、不可变 Workspace descriptor、过期校验分支与可注入 clock/TTL 的测试能力。

**Non-Goals:**

- 不引入 token refresh RPC、MCP hot reload 或 Agent-specific token 更新协议。
- 不把 grant 持久化到磁盘，也不允许 token 跨 Main/bundled MCP host 生命周期存活。
- 不改变 stdio MCP activation 的独立 child/descriptor 语义。
- 不改变 ACP Session 的持久化 ID、恢复顺序或 public IPC/API。
- 不依赖 token 到期响应 Workspace membership 热更新；既有 activation 继续遵循不可变 Session snapshot 契约。

## Decisions

### 1. Production 默认使用固定远期 expiresAt，而非递增超长 TTL

在 `src/main/infra/mcp/mcp-access-grant-registry.ts` 用命名常量表达 production 默认到期时间 `2099-12-31T23:59:59.999Z`。`McpAccessGrantRegistry.issue()` 在调用方未提供 `ttlMs` 时直接使用该常量；测试显式提供 `ttlMs` 时继续按注入 clock 计算短期 `expiresAt`，从而保留过期授权、惰性删除与 proxy 拒绝路径的确定性测试。

选择固定日期而不是 `Number.MAX_SAFE_INTEGER`、`Infinity` 或删除 `expiresAt`，是为了保留现有 grant 结构与授权检查，避免引入新的 nullable/union 状态。选择直接写入固定日期而不是计算“当前时间到 2099 的 TTL”，可以让所有 production activation 得到完全一致、可审计的语义。

备选方案是滑动续期或每小时轮换 token；拒绝该方案，因为 Agent 持有的 MCP header无法可靠热更新，滑动续期还会让外部 token 请求本身成为维持授权的信号。备选方案是彻底移除 expiry；拒绝该方案，因为用户要求保留过期机制，并且短 TTL 注入仍是验证拒绝路径的有效手段。

### 2. MessagePort close 只有在 stream 未进入终态时才传播 cancel

`src/main/ipc/_kit/stream-channel.ts` 在 `port1` 的 `close` 事件中先读取 `state.finalised`：`sendDone/sendError` 已将 state 标为终态时，只记录端口关闭，不调用 runner cancel；renderer 在终态前关闭端口时才记录 pending cancellation并调用 runner。若 renderer 早于异步 `onReady()` 结果断开，pending cancellation在 runner 可用后只执行一次。

该判断位于通用 stream 边界，因此 chat、apply 与 archive 共享一致语义。`acp-stream-driver.ts` 的 done/error handler继续只发送终态并 unregister turn handler，不主动关闭 ACP activation。

备选方案是在每个 chat/apply/archive handler内忽略终态后的 cancel；拒绝该方案，因为错误源属于 MessagePort transport，分散修复容易再次产生不一致。

### 3. AcpSession.cancel 只发送 ACP session/cancel，不 forget activation

`src/main/services/session/chat/acp-session.ts` 的 `cancel()` 继续设置 turn-local `cancelled` 状态并幂等调用 `connection.cancel({ sessionId })`，但 `cancelResolvedAcpSession()` 不再调用 `forgetActiveAcpSession()`。已绑定 ACP Session 保留在 process entry 的 `activeSessionIds` 与 `mcpActivationBySessionId` 中，下一轮可走 direct prompt并复用 token。

取消发生在 lifecycle activation尚未成功绑定时，`activateAcpSession()` 现有 `checkCancelled` 与 `try/finally` 仍撤销本次未绑定 grant；这不属于保留活跃 Session，而是清理从未完成的 activation。取消后 Agent process若真实退出，process pool invalidation仍通过 `revokeAgent()` 撤销全部相关 grants。

真实 Session 关闭继续使用 `connection.closeSession()` 与 `forgetActiveAcpSession()` 的组合；activation replacement、direct prompt报告 session missing、recovery失败、probe丢弃和 process shutdown仍走既有 invalidation入口。generic terminal error本身不证明 ACP Session 已关闭，因此不单独撤销；若错误来自 transport/process退出，process pool是权威撤销来源。

备选方案是 prompt cancel后重启整个 Agent process以确保 token更新；拒绝该方案，因为 ACP定义 cancel为 turn级操作，重启会放大成本并破坏同一 process内其他 Session。

### 4. 回归测试覆盖跨层不变量，而非只断言单个函数

测试分为三层：

- `test/main/ipc/_kit/stream-channel.spec.ts`：done、error、自关闭、renderer提前断开以及 runner延迟创建竞态。
- `test/main/services/session/chat/acp-session.spec.ts` 与 `acp-stream-driver.spec.ts`：显式 cancel发送一次 ACP notification但保留 active Session/activation；取消后的下一轮仍可 direct prompt；未绑定 activation在取消/失败时仍撤销。
- `test/main/infra/mcp/mcp-access-grant-registry.spec.ts` 与 `acp-process-pool.spec.ts`：production default固定到2099、注入短 TTL仍会过期、真实 forget/close/replacement/process invalidation继续撤销。

测试不得把 token或 token hash写入 snapshot/log assertion；只断言 activation identity、状态、expiresAt和授权结果。实现完成后运行 focused Main测试、`pnpm typecheck`、`pnpm lint` 与 Prettier检查，不运行完整 `pnpm build`，不启动 `pnpm dev`。

## Risks / Trade-offs

- [泄漏 token 的时间窗口扩大到 activation 生命周期] → grant仍仅存Main内存、proxy仅监听loopback、registry只存hash，并通过server allowlist与不可变descriptor限制权限；close、replacement、process/host/app lifecycle必须保留即时撤销测试。
- [某个遗漏的 invalidation入口不再由一小时 TTL掩盖] → 对所有 `forgetActiveAcpSession()`、probe close、process invalidation和host stop入口建立回归覆盖，并保留结构化 revoke reason日志。
- [固定2099日期在语义上近似不过期] → 使用明确命名常量和OpenSpec说明该选择，避免继续称为“短期 token”；过期分支仍通过注入短 TTL测试。
- [terminal error后 Agent Session实际已经不可用] → 不根据通用error猜测关闭；process/transport invalidation负责撤销，下一轮direct prompt若报告session missing则进入既有cold recovery。
- [取消发生在activation绑定竞态中] → 已绑定与未绑定状态沿用`markAcpSessionActive()`边界；绑定前由activation helper finally撤销，绑定后prompt cancel保留。

## Migration Plan

1. 先保留并验证通用 stream finalise/close 防重入修复，确保正常终态不触发 runner cancel。
2. 调整 `McpAccessGrantRegistry.issue()` 的 production默认expiresAt并补充固定日期与注入短TTL测试。
3. 调整 `AcpSession.cancelResolvedAcpSession()`，移除turn cancel对`forgetActiveAcpSession()`的调用，补充cancel后direct reuse与真实close/invalidation覆盖。
4. 运行focused tests、typecheck、lint和格式检查，再由用户在dev环境验证连续多轮、显式停止与长任务MCP调用。

本变更没有持久化数据迁移。回滚时恢复一小时默认TTL和旧cancel清理即可；Main重启会清空全部内存grant，不需要数据修复。

## Open Questions

无。production日期固定为`2099-12-31T23:59:59.999Z`；`session/cancel`确定为prompt-turn语义，只有真实activation/session生命周期结束才撤销grant。

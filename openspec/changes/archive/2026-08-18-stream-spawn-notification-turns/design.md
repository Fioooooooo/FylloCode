## Context

fyllo-spawn 后台任务（`prompt_to_agent` background 模式）的 turn 进入终态后，主进程把 notification record 原子转为 `pending` 并 wake renderer；renderer 逐条调用 `dispatchSpawnNotification` IPC，主进程 `executeNotificationTurn`（`src/main/services/session/chat/chat-turn-service.ts:252-321`）用**非流式** `driveAcpTurn` 跑父会话的通知回复，全程 `await` 到 turn 结束才返回。

由此产生三个用户可见问题：

1. 通知回复期间 renderer 收不到任何 chunk——内容只在主进程 MessageAssembler 组装、终态一次性 `appendMessage`，回复"瞬间出现"，对话看起来冻结。
2. renderer 从不为通知 turn 建立 stream state，`chatStatus` 停留 `ready`，没有 loading 指示。
3. dispatch IPC 全程持有 renderer 侧 `localTurnIntents` 的 `"notification"` 锁，而 UI gating 只看 `chatStatus`（此时为 ready）——用户看着能发消息，实际被 `tryAcquireLocalTurn` 静默拒绝，无任何提示。

关键现状事实（本次调查逐条核实过）：

- `driveAcpTurn` 不是独立通道，而是 `driveAcpStream` 的底座（`acp-stream-driver.ts:219` 内部委托）；spawn 后台 turn（`spawned-session-manager.ts:876`）也直接用它，为 `check_session_status` 的 snapshot 提供依据。**非流式通道必须保留。**
- `guidelines/MainProcess.md`（"边界"末节）明确要求：Workspace window close 只取消 window-owned chat/probe，**app-owned spawn/notification turn 继续运行**。因此通知 turn 的 `runtimeScope: "app"` 必须保留，流式化不得把生命周期降级为 window-owned。
- `makeStreamChannel`（`src/main/ipc/_kit/stream-channel.ts:109-116`）目前在 renderer 端口关闭且流未终态时调用 `runner.cancel()`——这与 app-owned 目标冲突，需要新增"断开不取消"选项。
- `driveAcpStream` 返回的 `AcpTurnRunner.completion` 与 `driveAcpTurn` 共用同一 `finish()` 机制（`acp-stream-driver.ts:111-129`）：completion 在 finalization（persist + 终态 hook）settle **之后** resolve，且区分 `done` / `error` / `cancelled` 三态。唯一缺口是 finalization 失败时 completion 仍按原 status resolve，失败只经 `hooks.onFinalizationError` → `output.sendError` 暴露。
- `driveAcpStream` 的 `hooks.onError` 不被 await（`acp-stream-driver.ts:242` 为 `void Promise.resolve(...)`）——本方案的 delivered 结算不走 `hooks.onError`，全部经 `runner.completion`，绕开该缺陷（聊天主路径依赖现有时序，不改 driver）。
- 通知 dispatch 是 renderer 发起的 invoke，handler 手里有 `event.sender`，可直接复用 `makeStreamChannel` 投递 port。
- `createRendererChatTurn`（`chat-turn-service.ts:204-240`）固定以 `"user"` kind 获取 gate lease（L208），与 dispatch 已持有的 `"notification"` lease 冲突，不能直接复用。
- `list` handler 每次都先跑 `reconcileWorkspace`（`src/main/ipc/session/chat.ts:103`），把 `dispatched` 态翻成 `delivery_unknown`；其 `isLive` 只检查 spawned turn（`spawnedSessionManager.isTurnLive`），不感知进行中的通知 dispatch turn——窗口 reload 后第一次 list 会误翻转仍在运行的通知 turn，后续 `markDelivered` 被 `setSpawnNotificationState` 的终态保护吞掉。保留 app-owned 必须一并修此竞态。
- 非活跃会话 messages 懒加载（`src/renderer/src/stores/session/session.ts:1049`：`messages.length > 0` 即跳过加载）——向未加载会话的内存数组 append 流式消息会让懒加载判断失效、丢历史。
- preload 的 `bindStreamPort`（`src/preload/api/session/chat.ts:80-113`）会 close 未知 streamId 的 port；pending 条目只由 `streamMessage()` 登记。
- spec `openspec/specs/fyllo-spawn/spec.md`「自动完成reminder按父Chat串行且采用至多一次投递」要求：reminder 由 Main 从已 claim record 生成、专用 dispatch 入口不得被公共提交入口代替或伪装、claim CAS 不可逆、至多一次投递。本设计全部保留。

## Goals / Non-Goals

**Goals:**

- 通知 turn 的 assistant 回复经 MessagePort 流式通道实时渲染，与正常用户消息同一观感。
- 通知 turn 期间目标会话 chat status 经历 `submitted` → `streaming`，Nuxt UI 自动渲染 loading；该会话发送按钮正确禁用，消除静默拒绝。
- 保持 app-owned 生命周期：端口断开/窗口关闭/reload 只中断实时投影，Main 继续完成 turn 并正确标记 `delivered`。
- dispatch IPC 状态契约完整覆盖 `accepted` / `busy` / `not_pending` / init 失败 / cancel / port close / done，任何路径不遗留 renderer 本地状态。
- 同一父会话多条 pending 通知逐条串行投递，busy 可靠重排队。
- 修复 reconcile 误翻转进行中通知 turn 的竞态。

**Non-Goals:**

- 不删除、不改动非流式 `driveAcpTurn` 及 `AcpTurnHooks`（spawn 后台 turn 依赖）。
- 不改动 spawn 后台 turn 本身的生命周期。
- 不引入 notification 重试机制（`delivery_unknown` 终态语义不变）。
- 不改动 reminder 的内容、生成方（Main）与权限语义。
- 不把通知并入公共提交入口 `sendMessage`（spec 明确禁止，且 `getPrimaryText` 会排除 system-reminder part 导致静默拒发）。
- 不扩展 `AcpStreamHooks`（结算走 `runner.completion`，见决策 5）。
- 不改变窗口关闭时 notification 自动重发的语义（仍不重发；但 turn 进行中不再被窗口关闭打断）。

## Decisions

### 1. dispatch IPC 升级为两阶段流式通道，不复用 sendMessage

renderer 仍调 `dispatchSpawnNotification`，但输入增加 preload 生成的 `streamId`。main handler 顺序：**先同步前置校验**（list 找 summary → 无则 `not_pending`；`chatTurnGate.tryAcquire(..., "notification")` → 失败 `busy`；`spawnNotificationService.claim` → 失败 `not_pending`），**任一失败不创建 port**，直接返回 `IpcResponse<{ status }>`；全部通过才调 `makeStreamChannel` 投递 port 并返回 `{ status: "accepted" }`。

`accepted` 的语义 = 已 claim、通道已建立、turn 在 renderer ready 握手后启动；**终态只经流通道的 done/error 传达**，invoke 返回值不再携带 `dispatched`（原语义"已完成"被流式化消除）。

reminder 仍由 Main 在 claim 后生成并注入 ACP——renderer 全程不接触 reminder 正文，满足 spec「reminder SHALL NOT 接受 Renderer 提供正文」。

备选方案（否决）：renderer 拿 reminder 文本后调 `chatStore.sendMessage` / `streamMessage`。违反 spec 两条 SHALL，且 `sendMessageCore` 的非空校验（`getPrimaryText` 排除 system-reminder part）会把纯 reminder 消息静默拒掉。

### 2. preload 契约：pending 登记 + 拒绝清理 + 取消

`dispatchSpawnNotification(workspaceId, notificationId, callbacks)`：`ensureStreamPortListener()` → `createStreamId()` → 登记 `pendingChatStreams`（复用 `streamMessage()` 的既有结构）→ invoke。invoke resolve 后：

- `!ok`（含 shutdown、校验失败、端口创建失败）：删除 pending 条目、closePort，调 `callbacks.onError({ code, message })`；
- `ok && status !== "accepted"`（`busy` / `not_pending`）：删除 pending 条目（此时无 port 到达），调新增的 `callbacks.onRejected(status)`；
- `accepted`：正常等 port，走现有 chunk/done/error 分发。

返回的 cancel 函数与 `streamMessage` 同款：置 `cancelled`、invoke `streamCancel`、closePort、删 pending。取消不自动触发 onDone/onError，由 renderer store 在调 cancel 的路径上自行清理 stream state（同现有 `cancelStream` 模式）。

### 3. reminder 用户消息仍由 Main 持久化，renderer 不 queue

`executeNotificationTurn` 现有的 `appendMessage`（reminder user message，现 L260）保留。renderer 侧不 `queueUserMessage`、不调 `persistMessage`——避免重复写入与不可见消息（projection 过滤后无渲染内容）的边界问题。

### 4. lease 仍由 dispatch 以 `"notification"` 获取，不复用 createRendererChatTurn

`executeNotificationTurn` 签名增加 `output: StreamOutput`，内部 `driveAcpTurn` 换 `driveAcpStream`（hooks 增加 `persistMessage`，`onControlEvent` 带 sink 转发），`holdLease`、claim 先行不变。gate 代码零改动。

### 5. delivered 结算走 runner.completion，不扩展 AcpStreamHooks

`executeNotificationTurn` 在 `supervised.start()` 后 `await supervised.completion`（与现非流式实现同一模式）：

- 包装传给 `driveAcpStream` 的 `persistMessage` 与 `onDone` 副作用：catch 时置本地 `finalizationFailed = true` 并 rethrow（让 driver 的 `onFinalizationError` → `sendError` 照常通知 renderer）；
- `completion.status === "done" && !finalizationFailed` → `markDelivered`；`error` / `cancelled` / finalization 失败 → `markDeliveryUnknown`。

`completion` 由 `finish()` 保证在 finalization settle 后 resolve，三态完备，这是比扩展 hooks 更小且不改聊天主路径时序的方案。

### 6. 保持 app-owned：`makeStreamChannel` 新增 `cancelOnPortClose` 选项

`MakeStreamChannelOptions` 增加 `cancelOnPortClose?: boolean`（默认 `true`，现有 chat/apply/archive 行为不变）。`port1.on("close")` 中：选项为 `false` 时只 `state.markClosed()`（后续 chunk/done/error 因 `closed` 变 no-op），**不置 `cancelRequested`、不调 `runner.cancel()`**。dispatch 传 `false`，`executeNotificationTurn` 的 `runtimeScope` 保持 `"app"`：窗口关闭 / reload 后 Main 继续跑完 turn、持久化 assistant、按决策 5 结算 `delivered`。

用户主动取消（活跃会话停止按钮）仍走 `streamCancel` → `sessionRegistry.cancel` → turn cancelled → `delivery_unknown`，与端口断开是两条独立路径。

备选方案（否决）：通知 turn 改 window-owned（port close 即 cancel）。与 `guidelines/MainProcess.md` 的 app-owned 要求冲突，且把"父 Agent 可靠收到完成通知"降级为依赖用户不关窗——这不是修复流式 UI 所必需的行为契约变化。

### 7. reconcile 竞态修复：gate 占用即视为 live，不新增 registry

通知 turn 运行期间必然持有父会话的 `"notification"` gate lease，因此 `list` handler（`ipc/session/chat.ts`）只需把 `chatTurnGate.isActive(workspaceId, parentSessionId)` 并入 `reconcileWorkspace` 的 `isLive` 参数——一行改动，不引入通知专用的 in-flight registry。已知的有意保守：若 record 停在 `dispatched` 且同会话恰好有用户 turn 在跑，翻转会推迟到该 turn 结束后的下一次 list——`delivery_unknown` 只延迟、不丢失。

### 8. renderer 本地锁只守临界区，gating 交给 stream state

`dispatchPendingNotification` 重写为：`tryAcquireLocalTurn(parentSessionId, "notification")` → 调 preload 流式 dispatch → **仅在 `onRejected`/init 失败路径或 `accepted` 后 `beginSessionStreamRun(parentSessionId)` 完成时释放 intent**；`accepted` 后 gating 由 streamState 的 `submitted`/`streaming` 承担（`tryAcquireLocalTurn` 本就检查该状态，`chat.ts:168-169`）。所有终态（onDone/onError/用户 cancel/跨 Workspace 切换）都清理 stream state；intent 不覆盖整个 turn 时长，避免 reload/异常路径遗留本地锁。

busy 接力：`onRejected("busy")` 时不放弃、不建状态——notification 未被 claim（lease 先于 claim 获取，busy 时 record 保持 durable `pending`）。busy 的唯一来源是同会话有 turn 在跑，而所有 turn（用户/通知）的流式终态回调末尾统一 `requestSpawnNotificationDrain`（决策 10），结束后自动接力；为吸收 lease 释放与 renderer 收 done 的跨进程时序差，busy 时额外安排一次短延迟（约 300ms）的重新 drain 兜底。不新增 main 侧排队、不引入重试计数器。

### 9. 非活跃会话与 reminder 内存同步

- 目标会话是活跃会话或已加载（`loadedSessionIds`）：正常消费 chunk（复用决策 10 的共用逻辑），**终态后 `refreshSessionMessages(parentSessionId)`** 重新拉取 canonical 消息——把 Main 持久化的隐藏 reminder 与最终 assistant 消息同步进内存，覆盖流式期间的增量投影。
- 目标会话未加载：不接内容流（chunk 只驱动 stream state，不进 messages），终态后不 refresh——保持懒加载，用户之后选中会话时 `selectSession` 全量加载（含 reminder 与回复），不破坏 `session.ts:1049` 的判断。
- 任何情况不切换 active session、不覆盖 composer（spec 既有要求不变）。

### 10. renderer 抽取共用 chunk 消费逻辑

从 `streamSessionMessage`（`stores/session/chat.ts:329-452`）抽取 chunk 分发与流状态迁移（首个内容 chunk 置 `streaming`、onDone/onError 清状态并结算 tokenUsage/status、末尾 `requestSpawnNotificationDrain`）为可复用函数，参数化目标 session 与 streamRunId；正常消息路径与通知路径共用。`drainSpawnNotifications` 改为同一 `parentSessionId` 串行、不同会话并行；通知 turn 终态后经共用逻辑末尾的 `requestSpawnNotificationDrain` 自动接力同会话下一条（修复现存滞留 bug）。

## Risks / Trade-offs

- 端口断开后 Main 继续跑 turn，renderer 重开前用户看不到这轮回复的生成过程 → 接受：终态持久化完整，重开后经 list/drain 与消息加载可见；这正是 app-owned 的既有语义。
- 非活跃未加载会话的通知回复在流式期间完全不可见（无 chunk 投影） → 与现状等价（现状连状态都没有），且该场景用户本就看不见该会话；stream state 仍按 sessionId 记录，用户切过去可见 loading。
- `accepted` 与 port 到达之间存在窗口：main 在 `makeStreamChannel` 内同步 post port 后 invoke 才 resolve，preload 的 pending 条目已提前登记，时序安全；但 `bindStreamPort` 的未知 streamId close 兜底要求登记必须先于 invoke，这是必须遵守的集成点（漏掉会导致 port 被关、流静默失败）。
- claim 后、`makeStreamChannel` 建通道前进程崩溃 → record 停在 `dispatched` → reconcile 记 `delivery_unknown`，不重发。与既有 crash 语义一致，不恶化。
- busy 接力依赖进行中 turn 终态回调的 drain + 一次延迟重新 drain 兜底 → 极端时序下投递可能延迟数秒，但 record 始终 durable pending，不会丢投递。

## Migration Plan

无数据迁移。notification record 结构与状态机不变；`SpawnNotificationDispatchResult` 的 `dispatched` 状态语义改为 `accepted`，为进程内 IPC 契约变化，随版本整体发布。

## Open Questions

（无）

## 1. Shared 契约

- [x] 1.1 `src/shared/ipc/session/chat.schemas.ts`：`dispatchSpawnNotificationInputSchema` 增加必填 `streamId` 字段（与 `streamMessageInputSchema` 的 `streamId` 同款校验）；`SpawnNotificationDispatchResult` 的 `dispatched` 状态改为 `accepted`（语义 = 已 claim、通道已建立），保留 `not_pending` / `busy`
- [x] 1.2 `src/shared/ipc/session/chat.channels.ts`：dispatch 流通道复用 `SessionChatStreamChannels.streamPort`（port payload `{ streamId }` 与 streamMessage 一致）

## 2. stream-channel：端口断开不取消选项

- [x] 2.1 `src/main/ipc/_kit/stream-channel.ts`：`MakeStreamChannelOptions` 增加 `cancelOnPortClose?: boolean`（默认 `true`）；`port1.on("close")`（现 L109-116）中当选项为 `false` 时只调 `state.markClosed()`，不置 `cancelRequested`、不调 `runner.cancel()`。该选项只停留在 transport 层：现有 chat/apply/archive 调用方不传，行为不变；业务层（chat-turn-service）不感知该选项
- [x] 2.2 `test/main/ipc/_kit/stream-channel.spec.ts`：新增用例——`cancelOnPortClose: false` 时端口在终态前关闭，runner 不被 cancel 且 `start()` promise 正常走完；默认行为（取消）回归

## 3. Main 进程：通知 turn 流式化与结算

- [x] 3.1 `src/main/services/session/chat/chat-turn-service.ts`：`executeNotificationTurn` 签名增加 `output: StreamOutput`；内部 `driveAcpTurn` 替换为 `driveAcpStream`（hooks 增加 `persistMessage: (message) => appendMessage(...)`，`onControlEvent` 改为 `(event, sink) => prepared.enqueueControlEvent(event, sink)`）；保留 reminder 用户消息的 Main 侧 `appendMessage`（现 L260）、`holdLease`、claim 先行；`runtimeScope` 保持 `"app"` 不变
- [x] 3.2 同文件：delivered 结算走 `runner.completion`——包装传入的 `persistMessage` 与 `onDone` 副作用，catch 时置本地 `finalizationFailed = true` 并 rethrow；`await supervised.completion` 后按 `completion.status === "done" && !finalizationFailed` → `markDelivered`，否则 → `markDeliveryUnknown`。不把副作用放入 `hooks.onError`（driver 不 await 它，`acp-stream-driver.ts:242`）
- [x] 3.3 `src/main/ipc/session/chat.ts`：dispatch handler（现 L110-116）改为两阶段——先做前置校验（list 找 summary → `not_pending`；`chatTurnGate.tryAcquire(..., "notification")` → `busy`；`claim` → `not_pending`），任一失败直接返回对应状态、**不创建 port**；全部通过后调 `makeStreamChannel({ event, portChannel: SessionChatStreamChannels.streamPort, portPayload: { streamId }, cancelOnPortClose: false, onReady: (sink) => ... })` 并返回 `{ status: "accepted" }`（参考同文件 streamMessage handler L295-324）
- [x] 3.4 同文件：`list` handler（现 L99-108）的 `reconcileWorkspace` `isLive` 参数并入 `chatTurnGate.isActive(workspaceId, parentSessionId)`——通知 turn 持有 gate 期间 record 不得被翻转为 `delivery_unknown`（gate 被同会话用户 turn 占用时翻转推迟到下次 list，只延迟不丢失）
- [x] 3.5 确认不删除 `driveAcpTurn` 与 `AcpTurnHooks`（`spawned-session-manager.ts:876` 与 `driveAcpStream` 底座均依赖）；`createRendererChatTurn` 的 `"user"` lease 不参数化，dispatch 继续自行持有 `"notification"` lease

## 4. Preload / Renderer API

- [x] 4.1 `src/preload/api/session/chat.ts`：`dispatchSpawnNotification(workspaceId, notificationId, callbacks)` 改为流式——`ensureStreamPortListener()` → `createStreamId()` → 登记 `pendingChatStreams`（复用 `streamMessage()` 现 L203-237 的结构与 catch 清理）→ invoke 携带 `streamId`。invoke resolve 后：`!ok` → 删 pending + closePort + `callbacks.onError`；`ok && status !== "accepted"` → 删 pending + 调新增的 `callbacks.onRejected(status)`；`accepted` → 正常等 port。返回与 `streamMessage` 同款的 cancel 函数
- [x] 4.2 `src/renderer/src/api/session/chat.ts`：`chatApi.dispatchSpawnNotification` 调整为流式 API（`onChunk` / `onDone` / `onError` / `onRejected` 回调 + cancel 返回值），类型与 preload 对齐

## 5. Renderer store：drain 复用正常消息流

- [x] 5.1 `src/renderer/src/stores/session/chat.ts`：从 `streamSessionMessage`（现 L329-452）抽取 chunk 分发与流状态迁移为可复用函数（参数化目标 session、streamRunId、assembler），正常消息路径与通知路径共用；`onChunk` default 分支抛错行为保留
- [x] 5.2 重写 `dispatchPendingNotification`（现 L178-193）：`tryAcquireLocalTurn(parentSessionId, "notification")` → 调流式 dispatch；`onRejected("busy")` → 释放 intent、不建状态，安排一次约 300ms 延迟的 `requestSpawnNotificationDrain(workspaceId)` 兜底（主接力来自进行中 turn 终态回调的 drain；record 保持 durable pending）；`onRejected("not_pending")` / init 失败 → 释放 intent、不建状态；`accepted` → `beginSessionStreamRun(parentSessionId)` 后**立即释放 intent**（gating 交给 streamState），按 5.1 共用逻辑消费 chunk
- [x] 5.3 通知 turn 终态处理：目标会话已加载（`loadedSessionIds`）或为活跃会话时 `await refreshSessionMessages(parentSessionId)` 同步 Main 持久化的 reminder 与最终 assistant 消息；未加载会话不接内容流（chunk 只驱动 stream state）、终态后不 refresh，保持现有懒加载语义，不引入 notification 专用投影层
- [x] 5.4 `drainSpawnNotifications`（现 L195-211）：同一 `parentSessionId` 的多条通知串行 dispatch，不同会话可并行；wake 重入保护（`notificationDrainRequests` / `notificationDrainByWorkspace`）保留；通知 turn 的 onDone/onError 末尾经共用逻辑 `requestSpawnNotificationDrain(workspaceId)` 接力同会话下一条
- [x] 5.5 验收：通知 turn 期间目标会话若为活跃会话，`ChatPromptPanel` 的 `promptBusy` 因 chatStatus 为 submitted/streaming 正确禁用发送；`busy` / init 失败 / 取消 / 端口断开任何路径都不遗留 stream state 或本地 intent

## 6. 测试适配与回归

- [x] 6.1 `test/main/services/session/chat/chat-turn-service.spec.ts`：通知 turn 用例注入 StreamOutput mock，断言 chunk 经 sink 转发；覆盖 done → `markDelivered`、error / cancel / finalization 失败（persistMessage 抛错）→ `markDeliveryUnknown`
- [x] 6.2 `test/main/ipc/session/chat.spec.ts`：dispatch 两阶段用例——`not_pending` / `busy` 时无 port 创建且同步返回；accepted 时建立通道；`list` 的 reconcile 在 gate 被同会话 turn 占用时不翻转 `dispatched`
- [x] 6.3 `test/preload/api/session/chat.spec.ts`：dispatch 的 pending 登记、accepted / 拒绝 / init 失败三条路径的清理、cancel 行为
- [x] 6.4 `test/renderer/src/stores/session/chat.spec.ts` 与 `test/renderer/src/bootstrap/spawn-notifications.spec.ts`：drain 串行、chatStatus 状态迁移、busy 延迟重新 drain、终态 refresh（已加载/未加载分支）、intent 只在临界区持有（spawn-notifications.spec.ts 只覆盖 bootstrap wiring、drain 已 spy，无需改动）
- [x] 6.5 回归用例：同一父会话两条 pending 通知依次投递不滞留；用户取消通知 turn → 状态清理 + `delivery_unknown`；端口断开 → runner 继续完成并标记 `delivered`；跨 Workspace 切换 → 通知 turn 状态不串扰

## 7. 验证

- [x] 7.1 在 worktree 根目录运行 `sh scripts/prepare-worktree-env.sh` 准备环境
- [x] 7.2 `pnpm typecheck && pnpm lint` 通过
- [x] 7.3 `pnpm test` 通过

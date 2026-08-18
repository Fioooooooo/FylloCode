## Why

fyllo-spawn 后台任务完成后，父会话的通知回复走非流式 `driveAcpTurn`：renderer 在整个回复期间收不到任何 chunk，对话看起来冻结；chat status 停留在 `ready`，没有任何 loading 反馈；同时 dispatch IPC 全程持有会话锁，用户主动发消息被静默拒绝（无提示、无反馈）。需要把通知 turn 接入与普通用户消息相同的流式对话流程。

## What Changes

- `dispatchSpawnNotification` IPC 升级为 MessagePort 流式通道（复用 `makeStreamChannel`），通知 turn 的 driver 从 `driveAcpTurn` 换成 `driveAcpStream`，assistant 回复 chunk 实时推送到 renderer。
- renderer 通知 drain 复用正常消息的 chunk 消费与流状态机：dispatch 被接受后把目标父会话的 chat status 置为 `submitted`（Nuxt UI 自动渲染 loading），收到首个内容 chunk 后转为 `streaming`；通知 turn 期间该会话发送按钮正确禁用，不再出现"看着能发、实际静默拒绝"。
- **通知 turn 保持 app-owned 生命周期**（`runtimeScope: "app"` 不变，符合 `guidelines/MainProcess.md`）：MessagePort 只负责实时投影；`makeStreamChannel` 增加"端口关闭不取消 runner"选项，窗口关闭 / renderer reload 只中断实时投影，Main 继续完成 turn、持久化 assistant 并正确标记 `delivered`。
- 修复 reconcile 竞态：通知 turn 仍在 Main 运行时，`list` 触发的 reconcile SHALL NOT 把 `dispatched` 误翻为 `delivery_unknown`（否则后续 `markDelivered` 变 no-op，app-owned 可靠性失效）。
- dispatch 的 IPC 契约明确为两阶段：前置校验（`not_pending` / `busy`）同步返回且不建 port；接受后返回 `accepted`（已 claim、通道已建），终态只经流通道的 done/error 传达。
- renderer 本地 turn 锁只保护"获取资格到建立 stream state"的临界区，之后由 stream state 控制发送 gating；所有取消/断开/失败路径都清理两者。
- `busy` 时 notification 保持 durable pending 且不被 claim：主接力来自进行中 turn 终态回调的统一 drain，另加一次短延迟重新 drain 兜底，不依赖可能不会到达的 wake，也不引入重试计数或 main 侧排队。
- 通知 turn 终态后 refresh 目标会话 canonical messages（仅当会话已加载或为活跃会话），把 Main 持久化的隐藏 reminder 同步进 renderer 内存；未加载过的会话保持懒加载，不接内容流。
- 同一父会话多条 pending 通知逐条串行 dispatch，前一条结束后自动接力，不再滞留 pending。
- 保持不变：reminder 由 Main 从已 claim 的 durable record 生成（不接受 renderer 提供的正文或目标覆盖）；专用 dispatch 入口独立于"用户提交必须包含非空普通 text"的公共提交入口；claim CAS 不可逆、至多一次投递、普通用户 turn 优先。
- 明确不删除非流式 `driveAcpTurn`：它是 `driveAcpStream` 的实现底座，且 spawn 后台 turn（`spawned-session-manager.ts`）依赖它为 `check_session_status` 提供 snapshot。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `fyllo-spawn`: 修改「自动完成reminder按父Chat串行且采用至多一次投递」——通知 turn 改为经流式通道实时渲染（生命周期保持 app-owned，端口断开只中断投影不取消 turn）；补充 reconcile 不得翻转进行中通知 turn、同一父会话多条通知串行投递的要求。

## Impact

- 代码：
  - `src/main/ipc/_kit/stream-channel.ts`（新增端口关闭不取消 runner 的选项）
  - `src/main/services/session/chat/chat-turn-service.ts`（`executeNotificationTurn` 流式化、completion 结算）
  - `src/main/ipc/session/chat.ts`（dispatch handler 两阶段改造、reconcile isLive 扩展）
  - `src/preload/api/session/chat.ts`（dispatch 流式 API：pending stream 登记、拒绝清理、cancel）
  - `src/shared/ipc/session/chat.schemas.ts`（dispatch 输入增加 `streamId`、结果语义改 `accepted`）
  - `src/renderer/src/api/session/chat.ts`（dispatch 改为流式 API）
  - `src/renderer/src/stores/session/chat.ts`（抽取共用 chunk 消费逻辑、重写 drain/dispatch 流程）
- 测试：
  - `test/main/ipc/_kit/stream-channel.spec.ts`（端口断开不取消）
  - `test/main/services/session/chat/chat-turn-service.spec.ts`
  - `test/main/ipc/session/chat.spec.ts`
  - `test/preload/api/session/chat.spec.ts`
  - `test/renderer/src/stores/session/chat.spec.ts`
  - `test/renderer/src/bootstrap/spawn-notifications.spec.ts`
- spec：`openspec/specs/fyllo-spawn/spec.md`（delta 见本 change 的 specs/）
- guideline：无需修改（方案与 `guidelines/MainProcess.md` 的 app-owned 要求保持一致）
- 依赖：无新增

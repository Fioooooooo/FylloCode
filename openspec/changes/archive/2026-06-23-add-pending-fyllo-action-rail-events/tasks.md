## 1. Pending action 派生模型

- [x] 1.1 在 `src/renderer/src/utils/fyllo-action.ts` 或相邻 renderer utility 中新增 `buildChatFylloActionId(input)`，参数包含 `sessionId`、`messageIndex`、`partIndex`、`actionOrdinalInPart`，返回格式必须与现有 `FylloActionNode.vue` 的 `chat:{sessionId}:{messageIndex}:{partIndex}:{ordinal}` 完全一致；将 `FylloActionNode.vue` 改为调用该 helper。
- [x] 1.2 新增 `collectPendingFylloActionRailItems(session: Session | null): PendingFylloActionRailItem[]`（文件可放在 `src/renderer/src/utils/fyllo-action-rail.ts`），遍历 `session.messages` 中 assistant text part，解析 ready Fyllo actions，按源码顺序计算 ordinal，生成 action id，并过滤 `session.actionStates` 中已存在的 action。
- [x] 1.3 扩展 `src/renderer/src/config/fyllo-actions.ts` 的 action definition 类型，增加可选 `getSummary(payload): string | undefined`；为 `task.create` 返回 payload title；rail 收集逻辑必须通过 definition 读取 title/icon/summary，不在事件栏组件内写死 `task.create` payload 字段。
- [x] 1.4 为 pending action 收集函数新增测试（建议 `test/renderer/src/utils/fyllo-action-rail.spec.ts`），覆盖单个 action、同一 text part 多个 action、已存在 `succeeded`/`failed`/`cancelled` state 时过滤、invalid/streaming action 不进入结果。

## 2. 事件栏展示与响应式消失

- [x] 2.1 新增 `src/renderer/src/components/chat/event/ChatFylloActionPanel.vue`（或同等命名组件），接收 `items: PendingFylloActionRailItem[]`，渲染“待处理操作”分组；每个 item 使用 definition icon/title/summary，并 emit `locate-action`。
- [x] 2.2 修改 `src/renderer/src/components/chat/event/ChatSessionEventRail.vue`，从 `activeSession` computed 派生 pending action items，展示 `ChatFylloActionPanel`，并把 `locate-action` 继续向外 emit；保持 plan/proposal 面板现有行为。
- [x] 2.3 修改 `src/renderer/src/components/chat/ChatContainer.vue` 的 `showEventRail`，当 plan、proposal 或 pending Fyllo action 任一存在时显示事件栏；草稿态仍不显示。
- [x] 2.4 更新 `test/renderer/src/components/chat-session-event-rail.spec.ts` 与 `test/renderer/src/components/chat-container.spec.ts`，覆盖仅有 pending action 时事件栏显示、无事件时隐藏、`activeSession.actionStates[actionId]` 从缺失变为 `cancelled`/`failed` 后 rail item 消失且不依赖新增消息。

## 3. DOM anchor 与点击定位

- [x] 3.1 修改 `src/renderer/src/components/shared/markstream/FylloActionShell.vue`，在根 `<section>` 上添加 `:data-fyllo-action-id="props.actionId ?? undefined"`，只在存在 action id 时输出属性；保持现有确认/取消状态流转不变。
- [x] 3.2 修改 `src/renderer/src/components/chat/ChatContainer.vue`，为消息滚动容器添加 `ref`，实现 `handleLocateFylloAction(actionId: string)`：`await nextTick()` 后在滚动容器内用 `CSS.escape(actionId)` 查询 `[data-fyllo-action-id="..."]` 并调用 `scrollIntoView({ block: "center", behavior: "smooth" })`；找不到目标时静默返回，不修改 action state。
- [x] 3.3 将 `ChatSessionEventRail` 的 `locate-action` 事件接到 `ChatContainer.handleLocateFylloAction`；rail item 点击不得调用 action confirm handler、task store、lineage API 或任何 IPC。
- [x] 3.4 为定位链路补充组件测试：验证 `FylloActionShell` 输出 data anchor；验证点击 rail item 会对目标元素调用 `scrollIntoView`；验证找不到目标时不抛错且不调用 action state 持久化。

## 4. 文档与验证

- [x] 4.1 评估并更新 `guidelines/RendererProcess.md` 的 Chat Markdown Rendering 或 Chat Session Event Rail 相关说明，补充 pending Fyllo action rail 必须保持提醒/定位与执行边界分离，且不得新增 action 执行业务入口。
- [x] 4.2 运行 `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`，确保 renderer 相关测试通过。
- [x] 4.3 运行 `pnpm typecheck:web`，确保新增 utility、component emits、action definition 类型和 tests 类型通过。

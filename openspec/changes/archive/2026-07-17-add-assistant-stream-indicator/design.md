## Context

`ChatMessageList.vue` 当前把 `chatStatus` 交给 `UChatMessages`，但该组件的 `indicator` 是消息列表级内容：`submitted` 时始终显示，`streaming` 时仅在最后一条 assistant 消息尚无内容时显示。因此它不能表达“哪一条已开始输出的 assistant 消息仍在回复”。

Renderer 在 `useUIMessageAssembler()` 中根据 stream chunk 创建临时 assistant `UIMessage`；主进程会独立组装并持久化同一轮回复，两个 message ID 不保证相同。`useChatStore()` 已有 `streamStateBySessionId: Map<string, ChatSessionStreamState>`，用 `runId` 防止过期 stream 回写，天然支持不同 session 的并行运行。

本变更的计时是当前 renderer 视图的瞬时反馈。它从首个 `text_delta`、`reasoning_delta`、`tool_call_start` 或 `tool_call_update` 创建 assistant 临时消息时开始，结束、错误、取消或 renderer 卸载时消失；不需要也不得重载历史消息后恢复。

## Goals / Non-Goals

**Goals:**

- 在当前正在 stream 的单条 assistant 消息内容之后展示独立的视觉状态组件。
- 让每个 session 的计时、临时消息关联和过期 stream 防护独立，即使用户切换到另一个仍在 stream 的会话也能显示其正确的经过时间。
- 提供固定轮换的状态文案、4×4 dot matrix 动画、`UChatShimmer` 和每秒刷新的中文经过时间。
- 严格保持持久化消息 ID、`MessageMeta`、JSONL 和 main/preload/IPC 契约不变。

**Non-Goals:**

- 不根据 reasoning、tool call 或 Agent 行为推断状态文案；预设文案只提供视觉反馈。
- 不在已完成、错误、取消或重载的历史消息下显示最终耗时。
- 不同步、持久化或在多个窗口之间共享这项运行时展示状态。
- 不替换现有 tool/reasoning 卡片，也不改变 `UChatMessages` 的内置 indicator 语义。

## Decisions

### 1. 将展示状态放入现有的 session stream state，而不扩展消息元数据

在 `ChatSessionStreamState` 中新增仅 renderer 运行期使用的 `assistantMessageId: string | null` 与 `replyStartedAt: number | null`。继续以 `sessionId` 作为 `streamStateBySessionId` key，并以现有 `runId` 过滤旧 stream chunk。

首个内容 chunk 由 `useUIMessageAssembler.applyChunk()` 创建/更新消息后，store 读取 assembler 当前临时 assistant message ID；若 state 仍属于同一个 run 且尚未有开始时间，原子地写入这两个字段。后续 chunk 不会重置时间或 ID。

选择该方案是因为主进程与 renderer 对同一回复生成不同 message ID，且计时不应在重载后存在。将字段写入 `MessageMeta` 或让 main 传 message ID 会改变持久化/跨进程契约，也无法满足“只在当前界面”的范围。

备选方案是只以“消息数组中最后一个 assistant message”判断展示位置；它会在 stream 注入 `user_message` 或未来一个 run 产生多个 assistant 消息时错误归属，故不采用。

### 2. 让 assembler 暴露当前临时 assistant message ID

为 `UIMessageAssembler` 增加只读查询（例如 `getActiveAssistantMessageId()`），返回当前 stream 的 renderer 临时 message ID，`resetActive()` 后返回 `null`。该 API 不改变消息内容与持久化行为。

store 在处理内容 chunk 后使用该查询记录 UI 身份；不由组件扫描/猜测消息位置。这样 `AssistantMessage` 的匹配条件精确，且保留 assembler 对临时 ID 的唯一所有权。

### 3. 新增消息级 `AssistantStreamIndicator.vue` 并在 AssistantMessage 末尾挂载

在 `src/renderer/src/components/chat/message/AssistantStreamIndicator.vue` 创建独立组件，props 至少包含 `startedAt: number` 与可选的 `now` 注入/格式化边界（以便测试）。组件负责：

- 4×4 dot matrix 的预设 pattern interval；
- 预设中文状态文案的轮换和 scramble 动画；
- 使用现有 `UChatShimmer` 输出当前文案；
- 根据 `Date.now() - startedAt` 每秒计算经过时长，并按自然中文单位自适应展示：不足一分钟显示秒，一小时内显示分和秒，一天内显示小时和分，超过一天显示天和小时；
- 在 `onUnmounted` 中清理 interval，取消仍待执行的 animation frame，避免会话切换和流结束后的泄漏。

`AssistantMessage.vue` 在其 part 循环之后渲染该组件。它只接受由 `ChatMessageList.vue` 为匹配消息传来的 `streamStartedAt`，因此效果永远位于该 assistant 消息的所有 text、reasoning 与 tool 内容之后。

不使用 `UChatMessages` 的 `#indicator`：该 slot 的生命周期和位置属于整个消息列表，不满足消息级归属。现有 `UChatShimmer` 已由 `@nuxt/ui` 提供，直接复用，避免新增依赖或手写全局主题样式。

### 4. 在 ChatMessageList 以 message ID 精确投影当前 session 的展示状态

`useChatStore` 公开只读的 active-session presentation selector（或等效 computed），其结果仅在 `status === "streaming"` 且同时具备 `assistantMessageId` 与 `replyStartedAt` 时有效。`ChatContainer.vue` 将该投影传给正在展示 active session 的 `ChatMessageList.vue`；列表仅为 `message.id` 相同的 assistant 传递开始时间。

`onDone`、`onError` 和 `cancelStream()` 沿用现有 run 清理/替换策略：任何不再 streaming 的 state 不应继续投影 indicator。后台 session 的 state 仍保留在 map 中直到其各自终态，因此切换 session 不会互相覆盖计时。

## Risks / Trade-offs

- [首个内容前没有可展示的 assistant 消息] → 在 `submitted` 阶段不挂载该组件；首个内容 chunk 创建消息后才开始计时和显示，避免把排队/初始化时间计入回复耗时。
- [组件同时存在 interval 与 requestAnimationFrame] → 状态文案切换前取消上一轮 animation frame；卸载时清理所有 timer 和 frame；测试使用 fake timers 验证。
- [多个 session 并行 stream] → 全部 runtime 数据存于 `Map<sessionId, state>`，且每次回写验证 `runId`；不使用单例全局开始时间或当前 route 作为状态 key。
- [长时间运行导致每秒不必要重渲染] → 只有当前可见的匹配 `AssistantStreamIndicator` 挂载 ticker；后台 session 只保存绝对开始时间，用户切换回来时即时重新计算。
- [预设状态文案看似真实 Agent 进度] → 采用不描述具体工具或外部操作的通用文案，并在 spec 中明确不与 Agent event 绑定。

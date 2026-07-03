## Context

当前任务页通过 `src/renderer/src/pages/task.vue` 渲染 `TaskCard`，并在“发起讨论”时先调用 `lineageApi.ensureTaskSubject()`，再通过 `chatStore.sendMessage(..., { taskRef })` 创建带 `originTaskRef` 的会话。

当前会话列表已经能展示来源任务：`SessionItem.vue` 根据 `session.originTaskRef` 渲染任务图标，并在 hover 时通过 `sessionStore.ensureSessionOriginTaskInfo()` 调用 `lineageApi.getByTask(projectId, ref)` 读取任务标题。

lineage 后端已经具备任务到会话的反向投影：`getByTask(projectId, ref)` 返回 `TaskDownstreamProjection`，其中 `links` 是 `LineageSessionLink[]`。因此本变更应只消费现有投影，不修改存储结构、IPC channel 或 shared lineage schema。

聊天页面目前只有 `/chat` 一个路由。`src/renderer/src/pages/chat.vue` 在挂载时会调用 `sessionStore.beginDraftSession()`，这会把 `activeSessionId` 置为 `null`。因此从任务页打开关联会话时，不能只在跳转前选中 session；必须在进入 `/chat` 并让页面完成挂载后再执行 `sessionStore.selectSession(sessionId)`。

## Goals / Non-Goals

**Goals:**

- 任务卡能展示当前任务关联的会话入口。
- 用户能从任务页打开关联会话，并在 `/chat` 页面看到目标会话处于选中状态。
- 当前没有会话子路由时保持流畅；未来如果改为 `/chat/:sessionId`，只需要集中调整打开会话的 helper/composable。
- 关联会话加载采用 best-effort 策略，不能阻塞任务列表或覆盖现有任务错误状态。
- 使用现有 `LineageSessionLink` 和 session store 中的会话列表补齐显示信息。

**Non-Goals:**

- 不新增 `/chat/:sessionId` 路由。
- 不实现可复制或可刷新恢复的会话深链。
- 不新增批量 lineage 查询 IPC。
- 不修改 lineage JSON 存储格式、`LineageIndex`、`Subject` 或 `LineageSessionLink`。
- 不为关联会话展示 proposal、plan、commit 等完整 lineage 时间线；本次只展示会话入口。

## Decisions

### 1. 复用 `lineageApi.getByTask()` 获取反向会话链接

实现应在任务页根据 `TaskItem` 构造 `LineageTaskRef`，即 `${task.source}:${task.id}`，并调用 `lineageApi.getByTask(projectId, ref)`。返回 `null` 或 `links.length === 0` 时，任务卡不显示关联会话入口。

替代方案是新增批量查询 IPC，减少多任务列表下的请求次数。当前拒绝该方案，因为现有 projection 已满足行为要求，且新增 IPC 会扩大后端契约和测试面。若未来任务列表规模导致性能问题，再通过单独提案引入批量查询。

### 2. 任务页拥有关联会话加载状态，任务卡保持展示组件职责

`task.vue` 应维护按 `LineageTaskRef` 索引的关联会话加载结果，并把展示所需的会话条目传给 `TaskCard`。`TaskCard` 只负责展示和发出打开会话事件，不直接调用 lineage API、router 或 session store。

展示条目优先使用 `sessionStore.sessions` 中匹配 `sessionId` 的会话标题、状态和更新时间；找不到时回退展示 `sessionId` 和 lineage link 的 `createdAt`。这样可以在会话元信息缺失、会话被删除或 session store 尚未完整加载时继续保留可理解的 UI。

加载实现需要防止过期响应覆盖新项目或新筛选结果：当 `projectId` 或 `visibleTasks` 变化时，为当前批次生成请求标记，响应落地前确认仍是最新批次。单个任务加载失败时只记录该 ref 的失败状态，不设置 `taskStore.error`。

### 3. 用集中式 `useOpenChatSession()` 处理会话打开

新增 `src/renderer/src/composables/useOpenChatSession.ts`，暴露 `openChatSession(sessionId: string): Promise<void>`。

当前实现顺序为：

1. 调用 `useChatStore().resetChatState()` 清理临时聊天错误或流状态，保持与 `SessionItem.vue` 当前切换会话行为一致。
2. 如果当前路由不是 `/chat`，执行 `await router.push("/chat")`。
3. 执行 `await nextTick()`，让 `/chat` 页面完成挂载并运行 `beginDraftSession()`。
4. 执行 `await sessionStore.selectSession(sessionId)`。

这个顺序解决任务页跳转后 `/chat` 挂载逻辑覆盖选中态的问题。事件处理函数即使在任务页组件卸载后仍可继续执行，因为 router 和 Pinia store 不是页面实例私有对象；但集中式 helper 能减少各页面重复处理这个细节。

`SessionItem.vue` 也应改用同一个 helper。当前它已经位于 `/chat` 内，helper 会跳过 route push，只执行 reset 和 select；未来迁移到 `/chat/:sessionId` 时，侧边栏与任务页能共享同一个导航入口。

### 4. UI 展示保持轻量

任务卡底部操作区新增关联会话入口。建议使用 message/list 图标加数量文案，例如“2 个对话”，并通过 popover 或 dropdown 展示会话列表。每个列表项展示会话标题或 `sessionId` 回退文本，并展示最近更新时间或关联创建时间。

加载中不应让卡片布局跳动；可以仅在已获取到至少一个链接后显示入口。加载失败默认隐藏入口，避免把 lineage 查询失败误读为任务加载失败。

## Risks / Trade-offs

- 多个可见任务会触发多个 `getByTask()` 请求 -> 通过仅加载当前 `visibleTasks`、按 ref 缓存本页结果、并忽略过期批次响应来控制影响；暂不新增后端批量接口。
- `/chat` 挂载时调用 `beginDraftSession()` 可能覆盖跳转前选择 -> helper 在 `router.push()` 和 `nextTick()` 后再 `selectSession()`。
- `LineageSessionLink` 不包含会话标题 -> 从 `sessionStore.sessions` 补全，缺失时显示 `sessionId` 回退。
- 会话被删除但 lineage link 仍存在 -> UI 可显示回退条目；点击后 `selectSession()` 找不到会话时保持当前状态。实现可选择禁用找不到的条目，或点击后给出 toast，具体以测试验收为准。
- 当前方案不是深链 -> 用户刷新 `/chat` 不会恢复某个具体会话；这是本次明确的非目标。

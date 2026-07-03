## 1. 关联会话数据加载

- [x] 1.1 在 `src/renderer/src/pages/task.vue` 中新增任务 ref 构造 helper，复用现有格式 `${task.source}:${task.id}` 生成 `LineageTaskRef`；验收标准：本地、云效、GitHub 任务生成的 ref 与现有“发起讨论”逻辑一致。
- [x] 1.2 在 `src/renderer/src/pages/task.vue` 中为当前 `visibleTasks` 加载关联会话，调用 `lineageApi.getByTask(projectId, ref)` 并保存每个 ref 的 `links`、加载状态和失败状态；验收标准：`getByTask` 返回 `null` 或空 `links` 时，该任务没有关联会话入口。
- [x] 1.3 为关联会话加载增加过期响应保护：当 `projectStore.currentProject?.id` 或 `visibleTasks` 变化后，旧批次响应不得覆盖当前批次状态；验收标准：快速切换任务来源或项目时，任务卡不会显示上一个项目或上一个筛选结果的关联会话。
- [x] 1.4 用 `sessionStore.sessions` 补全关联会话显示信息，匹配到 `sessionId` 时使用会话标题、状态和更新时间，匹配不到时使用 `sessionId` 与 lineage link 的 `createdAt` 回退；验收标准：缺失会话元信息时仍能展示可识别的关联条目。

## 2. 任务卡展示与交互

- [x] 2.1 修改 `src/renderer/src/components/task/TaskCard.vue`，新增用于展示关联会话条目的 props，并新增 `open-session` emit；验收标准：`TaskCard` 不直接 import `lineageApi`、router、`useSessionStore` 或 `useChatStore`。
- [x] 2.2 在 `TaskCard.vue` 底部操作区显示关联会话入口，入口显示会话数量，例如“2 个对话”；验收标准：只有关联会话数量大于 0 时显示入口，且不会挤压现有“发起讨论”“任务来源”“删除任务”操作。
- [x] 2.3 在 `TaskCard.vue` 中通过 popover 或 dropdown 展示关联会话列表；验收标准：每个列表项显示会话标题或 `sessionId` 回退文本，并在点击时 emit 对应 `sessionId`。
- [x] 2.4 在 `src/renderer/src/pages/task.vue` 接收 `TaskCard` 的 `open-session` 事件并打开目标会话；验收标准：点击关联会话后进入 `/chat`，且目标会话被选中。

## 3. 聊天会话打开入口

- [x] 3.1 新增 `src/renderer/src/composables/useOpenChatSession.ts`，暴露 `openChatSession(sessionId: string): Promise<void>`；验收标准：该函数内部使用 `useRouter()`、`useRoute()`、`nextTick()`、`useSessionStore()` 和 `useChatStore()`，并封装完整打开流程。
- [x] 3.2 在 `openChatSession()` 中实现当前 `/chat` 路由模型：先 `chatStore.resetChatState()`，若当前路径不是 `/chat` 则 `await router.push("/chat")`，随后 `await nextTick()`，最后 `await sessionStore.selectSession(sessionId)`；验收标准：从任务页打开会话时不会被 `chat.vue` 的 `beginDraftSession()` 清掉选中态。
- [x] 3.3 修改 `src/renderer/src/components/chat/SessionItem.vue` 使用 `useOpenChatSession().openChatSession(session.id)` 替代本地重复的 reset/select 逻辑；验收标准：会话侧边栏点击行为与现有测试语义一致，且未来聊天子路由迁移只需调整 composable。

## 4. 测试与验证

- [x] 4.1 更新 `test/renderer/src/pages/task.spec.ts`，mock `lineageApi.getByTask()`、`sessionStore.sessions` 和 `openChatSession()`；验收标准：覆盖有关联会话时渲染入口、无关联会话时隐藏入口、查询失败不阻塞任务列表、点击条目调用打开会话入口。
- [x] 4.2 更新 `test/renderer/src/components/task-card.spec.ts`；验收标准：覆盖会话数量展示、popover/dropdown 条目渲染、标题缺失时使用 `sessionId` 回退、点击条目 emit `open-session`。
- [x] 4.3 新增 `test/renderer/src/composables/use-open-chat-session.spec.ts` 或等价测试；验收标准：覆盖从非 `/chat` 路由打开时按 `router.push("/chat")`、`nextTick()`、`sessionStore.selectSession()` 的顺序执行，以及当前已在 `/chat` 时不重复跳转。
- [x] 4.4 更新 `test/renderer/src/components/session-item.spec.ts`；验收标准：侧边栏点击仍会清理 transient chat state 并选中目标会话，测试不依赖旧的组件内私有实现。
- [x] 4.5 运行 `pnpm test -- --run test/renderer/src/pages/task.spec.ts test/renderer/src/components/task-card.spec.ts test/renderer/src/components/session-item.spec.ts test/renderer/src/composables/use-open-chat-session.spec.ts`；验收标准：相关测试全部通过。

## 5. 契约边界确认

- [x] 5.1 确认本变更不修改 `src/shared/types/lineage.ts`、`src/shared/schemas/ipc/lineage.ts`、`src/main/ipc/lineage.ts`、`src/main/services/lineage/lineage-service.ts` 或 `src/main/infra/storage/lineage-store.ts`；验收标准：实现复用现有 `TaskDownstreamProjection.links`，没有新增 lineage 存储字段、IPC channel 或 schema。

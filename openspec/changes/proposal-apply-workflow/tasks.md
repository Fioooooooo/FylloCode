## 1. 共享类型与 IPC Channel 定义

- [ ] 1.1 在 `shared/types/proposal.ts` 新增 `ApplyRunMeta` 接口（runId、changeId、workflowId、stages、currentStageIndex、stageAcpSessionIds、status、startedAt、updatedAt）
- [ ] 1.2 在 `shared/types/channels.ts` 的 `ProposalChannels` 对象中新增五个 channel 常量：`apply`、`stageStream`、`stageStreamPort`、`stageStreamCancel`、`loadRun`、`loadRunMessages`

## 2. Main 进程：apply-run 持久化工具函数

- [ ] 2.1 新建 `electron/main/ipc/proposal-apply/apply-run-store.ts`，实现以下函数（路径规则：`getDataSubPath("projects")/<encoded>/apply-runs/<changeId>/`）：
  - `applyRunDir(projectPath, changeId): string`
  - `saveApplyRunMeta(projectPath, meta: ApplyRunMeta): Promise<void>`（写 `run.json`）
  - `loadApplyRunMeta(projectPath, changeId): Promise<ApplyRunMeta | null>`（读 `run.json`）
  - `appendApplyRunMessage(projectPath, changeId, stageIndex, message: UIMessage<MessageMeta>): Promise<void>`（append `stage-{N}.messages.jsonl`）
  - `loadApplyRunMessages(projectPath, changeId, stageIndex): Promise<UIMessage<MessageMeta>[]>`（读 `stage-{N}.messages.jsonl`）
- [ ] 2.2 在 `electron/main/utils/paths.ts` 的 `SubPath` 类型中新增 `"apply-runs"` 条目（如需要；若直接用 `"projects"` 子路径则跳过）

## 3. Main 进程：MessageAssembler

- [ ] 3.1 新建 `electron/main/chat-agent/message-assembler.ts`，实现 `MessageAssembler` 类：
  - 内部维护 `currentMessage: UIMessage<MessageMeta> | null` 和 `activeTextPartIdx: number`
  - `apply(ev: SessionEvent): void`：处理 `text_delta`、`tool_call_start`、`tool_call_update` 事件，组装逻辑与 `frontend/src/stores/chat.ts` 的 `streamSessionMessage` 完全一致
  - `flush(): UIMessage<MessageMeta> | null`：返回当前组装完成的 message 并重置状态
  - 使用 `generateId` from `ai` SDK 生成 message id；`DynamicToolUIPart` 类型从 `ai` 引入

## 4. Main 进程：stage 类型分发策略

- [ ] 4.1 新建 `electron/main/ipc/proposal-apply/stage-runners.ts`，定义：
  - `StageRunnerContext` 类型：`{ changeId: string; projectPath: string; stage: WorkflowStage }`
  - `stageRunners: Partial<Record<WorkflowStageType, (ctx: StageRunnerContext) => string>>` Map
  - `proposal-apply` 条目：返回 `加载 skill fyllo-apply-change，实现 ${changeId}`
  - `buildStagePrompt(ctx): string`：查 Map，找不到则抛出 `{ code: "STAGE_TYPE_NOT_IMPLEMENTED" }` 错误

## 5. Main 进程：IPC Handlers

- [ ] 5.1 新建 `electron/main/ipc/proposal-apply.ts`，实现并导出 `registerProposalApplyHandlers()` 函数，注册以下 handlers：

  **`proposal:apply` handler**：
  - 接收 `{ projectId, changeId, workflowId }`
  - 调用 `resolveProjectPath(projectId)` 获取 `projectPath`（复用 `ipc/chat.ts` 中的同名函数，或从 `project-store` 直接调用 `loadProject`）
  - 调用 `workflow:list` 的内部逻辑（直接复用 `readWorkflowDirectory` 函数，不通过 IPC）找到对应 `WorkflowTemplate`；找不到则返回 `WORKFLOW_NOT_FOUND` 错误
  - 生成 `runId = "run-" + Date.now()`
  - 构造 `ApplyRunMeta`，调用 `saveApplyRunMeta` 写入磁盘
  - 读取项目 `openspec/changes/<changeId>/.openspec.yaml`，将 `status` 字段改为 `applying` 后写回（使用 `js-yaml` 的 `load` + `dump`）
  - 返回 `{ runId, stages: template.stages }`

  **`proposal:stageStream` handler**（参考 `ipc/chat.ts` 的 `streamMessage` handler 实现）：
  - 接收 `{ runId, stageIndex, projectId, changeId }`
  - 从 `loadApplyRunMeta` 读取 `runMeta`，取 `stages[stageIndex]`
  - 调用 `buildStagePrompt({ changeId, projectPath, stage })` 构造 prompt；失败则通过 port 发送 error
  - 取 `agentId = stage.agent ?? "claude-acp"`
  - 创建 `MessageChannelMain`，通过 `event.sender.postMessage("proposal:stageStream:port", null, [port2])` 传给 renderer
  - 创建 `AcpSession({ fylloSessionId: runId + "-" + stageIndex, agentId, projectPath, cwd: projectPath })`
  - 将 session 存入 `activeApplySessions: Map<string, AcpSession>`（key 为 `runId`）
  - 创建 `MessageAssembler` 实例
  - 注册 `session.on("event")` 处理各类 `SessionEvent`：
    - `text_delta` / `tool_call_start` / `tool_call_update`：调用 `assembler.apply(ev)`，同时通过 port 推送 chunk 给 renderer
    - `session_id_resolved`：将 `acpSessionId` 更新到 `run.json` 的 `stageAcpSessionIds[stageIndex]`
    - `done`：调用 `assembler.flush()` 获取 message，调用 `appendApplyRunMessage` 写磁盘，更新 `run.json` 的 `currentStageIndex`（+1）和 `updatedAt`，通过 port 发送 `{ type: "done" }`，关闭 port，从 `activeApplySessions` 移除
    - `error`：更新 `run.json` 的 `status` 为 `"error"`，通过 port 发送 `{ type: "error" }`（如果 port 仍活着），关闭 port，从 `activeApplySessions` 移除
  - 等待 renderer 发送 `{ type: "ready" }` 后调用 `session.start(prompt)`

  **`proposal:stageStream:cancel` handler**：
  - 接收 `{ runId }`
  - 从 `activeApplySessions` 找到对应 session，调用 `session.cancel()`，从 Map 移除

  **`proposal:loadRun` handler**：
  - 接收 `{ projectId, changeId }`
  - 调用 `loadApplyRunMeta(projectPath, changeId)`，返回结果（null 也正常返回）

  **`proposal:loadRunMessages` handler**：
  - 接收 `{ projectId, changeId, stageIndex }`
  - 调用 `loadApplyRunMessages(projectPath, changeId, stageIndex)`，返回结果

- [ ] 5.2 在 `electron/main/index.ts`（或 `ipc/index.ts`）中调用 `registerProposalApplyHandlers()`，确保 handlers 在应用启动时注册

## 6. Preload：暴露 API 给 renderer

- [ ] 6.1 在 `electron/preload/api/proposal.ts` 中新增以下方法（参考 `api/chat.ts` 的 `streamMessage` 实现模式）：
  - `apply(input: { projectId, changeId, workflowId }): Promise<IpcResponse<{ runId: string; stages: WorkflowStage[] }>>`
  - `stageStream(input: { runId, stageIndex, projectId, changeId }, callbacks: StreamCallbacks): () => void`
    - 内部通过 `ipcRenderer.invoke("proposal:stageStream", input)` 发起
    - 监听 `ipcRenderer.once("proposal:stageStream:port", ...)` 接收 port
    - port 收到消息后分发到 `callbacks.onChunk` / `callbacks.onDone` / `callbacks.onError`
    - port 就绪后发送 `{ type: "ready" }`
    - 返回 cancel 函数：调用 `ipcRenderer.invoke("proposal:stageStream:cancel", { runId })`
  - `loadRun(input: { projectId, changeId }): Promise<IpcResponse<ApplyRunMeta | null>>`
  - `loadRunMessages(input: { projectId, changeId, stageIndex }): Promise<IpcResponse<UIMessage<MessageMeta>[]>>`

## 7. Renderer：useProposalRunStore

- [ ] 7.1 新建 `frontend/src/stores/proposal-run.ts`，实现 `useProposalRunStore`（Pinia defineStore）：

  **State**：
  - `runMeta: ApplyRunMeta | null`
  - `messages: UIMessage<MessageMeta>[]`（当前 stage 的消息，实时追加）
  - `isStreaming: boolean`
  - `cancelFn: (() => void) | null`（当前 stream 的取消函数）

  **Actions**：

  `startRun(projectId: string, changeId: string, workflowId: string): Promise<void>`：
  - 调用 `window.api.proposal.apply({ projectId, changeId, workflowId })`
  - 成功后设置 `runMeta`，清空 `messages`，设置 `isStreaming = true`
  - 调用 `streamCurrentStage(projectId, changeId)`

  `streamCurrentStage(projectId: string, changeId: string): void`：
  - 取 `stageIndex = runMeta.currentStageIndex`
  - 调用 `window.api.proposal.stageStream({ runId, stageIndex, projectId, changeId }, callbacks)`
  - `onChunk`：调用内部 `applyChunk(data)` 更新 `messages`（逻辑与 `chat.ts` 的 `onChunk` 一致：text_delta 追加、tool_call_start 新增 part、tool_call_update 更新 part）
  - `onDone`：`isStreaming = false`；若 `stageIndex + 1 < runMeta.stages.length`，更新 `runMeta.currentStageIndex` 并重新调用 `streamCurrentStage`；否则 run 完成
  - `onError`：`isStreaming = false`，记录错误状态

  `resumeRun(projectId: string, changeId: string): Promise<void>`：
  - 调用 `window.api.proposal.loadRun({ projectId, changeId })`
  - 若返回 null，静默返回
  - 设置 `runMeta`
  - 调用 `window.api.proposal.loadRunMessages({ projectId, changeId, stageIndex: runMeta.currentStageIndex })`
  - 设置 `messages`

  `cancelRun(): void`：
  - 调用 `cancelFn?.()`，设置 `isStreaming = false`

## 8. Renderer：前端组件拆分与接入

- [ ] 8.1 新建 `frontend/src/components/proposal/ProposalDetailHeader.vue`，包含：
  - Props：`proposal: ProposalMeta | null`、`changeId: string`、`workflowMenuItems: DropdownMenuItem[][]`、`workflowStoreLoading: boolean`、`runMeta: ApplyRunMeta | null`、`isStreaming: boolean`
  - Emits：`back`、`open-side-panel`
  - 将 `[id].vue` 中 Header 区域的全部 template 和 `statusConfig` 定义迁移至此组件
  - applying 状态栏（`v-if="proposal?.status === 'applying' && runMeta"`）点击时 emit `open-side-panel`
  - "开始实现" `UDropdownMenu` 保持 `v-if="proposal?.status === 'draft'"`，`onSelect` 通过 prop 传入的 `workflowMenuItems` 驱动（父组件负责构造 `onSelect` 回调）

- [ ] 8.2 新建 `frontend/src/components/proposal/ProposalMarkdownContent.vue`，包含：
  - Props：`tabs: MarkdownTab[]`、`loading: boolean`、`error: string | null`、`modelValue: MarkdownTabValue`
  - Emits：`update:modelValue`（支持 `v-model`）
  - 将 `[id].vue` 中 Tabs 区域和 Content 区域的全部 template 迁移至此组件（`UTabs`、loading/error/empty 状态、`ChatComark` 渲染）
  - `MarkdownTab` 和 `MarkdownTabValue` 类型定义从 `[id].vue` 移至此组件（或提取到 `shared/types/proposal.ts`，按实现时判断）

- [ ] 8.3 新建 `frontend/src/components/proposal/ProposalApplySidePanel.vue`，包含：
  - Props：`runMeta: ApplyRunMeta | null`、`messages: UIMessage<MessageMeta>[]`、`isStreaming: boolean`
  - Emits：`close`
  - 将 `[id].vue` 中 SidePanel 区域的全部 template 迁移至此组件（panel header、stage 进度条）
  - 消息流区域：遍历 `messages`，按 `UIMessage.parts` 渲染：
    - `text` part → `ChatComark` 渲染 markdown 内容
    - `dynamic-tool` part，`state === "input-available"` → 显示工具名 + spinner（调用中）
    - `dynamic-tool` part，`state === "output-available"` → 显示工具名 + `title` 字段（已完成）
  - 移除 `mockLogs` 及其渲染逻辑，完全由 `messages` prop 驱动
  - 底部 streaming 指示器：`isStreaming` 为 true 时显示"正在执行..." + spinner；false 时隐藏

- [ ] 8.4 修改 `[id].vue`，精简为布局骨架 + 数据协调：
  - 引入 `useProposalRunStore`
  - 保留：`changeId` computed、`onMounted` 数据加载、`sidePanelOpen`、`tabs`、`loadingFiles`、`fileError`、`activeTab`、`currentProposal`、`workflowMenuItems`（含 `onSelect` 调用 `proposalRunStore.startRun`）
  - 移除：所有已迁移到子组件的 template 和 script 逻辑（`statusConfig`、`startWithWorkflow`、`openSidePanel`、`closeSidePanel`、`mockLogs`、`activeWorkflow`、`activeStageIndex`）
  - `onMounted` 新增恢复逻辑：`ensureProposalLoaded` 完成后，若 `currentProposal.value?.status === "applying"`，则 `sidePanelOpen.value = true` 并调用 `proposalRunStore.resumeRun(projectId, changeId.value)`
  - template 改为三个子组件的组合：
    ```html
    <ProposalDetailHeader
      :proposal="currentProposal"
      :change-id="changeId"
      :workflow-menu-items="workflowMenuItems"
      :workflow-store-loading="workflowStore.isLoading"
      :run-meta="proposalRunStore.runMeta"
      :is-streaming="proposalRunStore.isStreaming"
      @back="backToList"
      @open-side-panel="sidePanelOpen = true"
    />
    <ProposalMarkdownContent
      v-model="activeTab"
      :tabs="tabs"
      :loading="loadingFiles"
      :error="fileError"
    />
    <ProposalApplySidePanel
      v-if="sidePanelOpen && proposalRunStore.runMeta"
      :run-meta="proposalRunStore.runMeta"
      :messages="proposalRunStore.messages"
      :is-streaming="proposalRunStore.isStreaming"
      @close="sidePanelOpen = false"
    />
    ```

## 9. 验证

- [ ] 9.1 类型检查：运行 `pnpm typecheck`，确保无类型错误
- [ ] 9.2 端到端冒烟测试：
  - 打开一个 `status=draft` 的 proposal 详情页
  - 点击"开始实现"，选择内置 workflow（`quick-apply`）
  - 确认 SidePanel 打开，实时展示 agent 输出
  - 确认 `apply-runs/<changeId>/run.json` 和 `stage-0.messages.jsonl` 在 stage 完成后写入磁盘
  - 关闭窗口，重新打开同一 proposal 详情页
  - 确认 SidePanel 自动打开，展示历史日志

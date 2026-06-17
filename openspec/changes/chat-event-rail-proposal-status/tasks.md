## 1. Shared Types and Channels

- [ ] 1.1 在 `src/shared/types/channels.ts` 的 `ProposalChannels` 对象中新增 `statusChanged: "proposal:statusChanged"`。
  - 验收标准：`ProposalChannels.statusChanged` 存在且值为 `"proposal:statusChanged"`；`pnpm typecheck` 通过。

- [ ] 1.2 在 `src/shared/types/proposal.ts` 中新增 `ProposalStatusChangedPayload` 类型：

  ```ts
  export type ProposalStatusChangedPayload = {
    changeId: string;
    sessionId: string;
    projectPath: string;
    status: ProposalStatus;
    updatedAt: string;
  };
  ```

  - 验收标准：类型导出可用，无类型错误。

- [ ] 1.3 扩展 `ProposalStatusChangedPayload` 支持 removed 标记（可选字段）：
  ```ts
  export type ProposalStatusChangedPayload = {
    changeId: string;
    sessionId: string;
    projectPath: string;
    status: ProposalStatus;
    updatedAt: string;
    removed?: boolean;
  };
  ```

  - 验收标准：`removed: true` 时 renderer 从列表中移除对应 proposal。

## 2. OpenSpec Reader Path Resolution

- [ ] 2.1 在 `src/main/infra/proposal/openspec-reader.ts` 中新增 `resolveChangeDirAnywhere(projectPath: string, changeId: string): Promise<{ dir: string; archived: boolean; worktreePath?: string } | null>` 函数。
  - 必须查找以下路径（按顺序）：
    1. `<projectPath>/openspec/changes/<changeId>`
    2. `<projectPath>/openspec/changes/archive/<changeId>`
    3. 遍历 `<projectPath>/.worktrees/*` 下的 `openspec/changes/<changeId>`
    4. 遍历 `<projectPath>/.worktrees/*` 下的 `openspec/changes/archive/<changeId>`
  - 返回结果必须包含 `archived` 标志：在 archive 目录下为 `true`，否则为 `false`。
  - 验收标准：为以下每种情况至少添加一个单元测试：main active、main archive、worktree active、worktree archive、所有位置都不存在。

## 3. Main Process Proposal Status Service

- [ ] 3.1 创建 `src/main/services/proposal/proposal-status-service.ts`。
  - 必须导出单例 `proposalStatusService`。
  - 核心 API：
    ```ts
    watchProposal(projectPath: string, changeId: string, sessionId: string): void
    unwatchProposal(changeId: string): void
    unwatchAll(): void
    onStatusChanged(listener: (payload: ProposalStatusChangedPayload) => void): () => void
    ```
  - 验收标准：文件创建，类型检查通过，单例可导入。

- [ ] 3.2 实现 `watchProposal`：
  - 调用 `resolveChangeDirAnywhere(projectPath, changeId)` 定位 `.openspec.yaml`。
  - 如果找到，读取当前 status 并 emit 一次初始事件。
  - 使用 `fs.watch(watchedPath, listener)` 监听文件变化（注意：监听的是 `.openspec.yaml` 文件本身，而不是目录）。
  - 将 watcher 存入内部 `Map<changeId, WatchedProposal>`。
  - 如果同一 changeId 已被监听，先调用 `unwatchProposal(changeId)` 再重新监听。
  - 验收标准：调用 `watchProposal` 后，修改 `.openspec.yaml` 的 status 会触发事件。

- [ ] 3.3 实现 watcher 回调逻辑：
  - watcher 触发后，首先尝试读取当前 `watchedPath` 的 `.openspec.yaml`。
  - 如果读取成功，解析 `status`，与 `currentStatus` 比较，变化则 emit 事件并更新 `currentStatus`。
  - 如果读取失败，调用 `resolveChangeDirAnywhere(projectPath, changeId)` 重新定位：
    - 找到且 `archived === true`：emit `status: "archived"`，迁移 watcher 到新路径。
    - 找到且 `archived === false`：emit 解析到的 status，迁移 watcher 到新路径。
    - 未找到：emit `removed: true`，调用 `unwatchProposal(changeId)`。
  - 验收标准：覆盖 status 变化、archive 移动、删除三种场景的单元测试。

- [ ] 3.4 实现 `unwatchProposal` 与 `unwatchAll`：
  - `unwatchProposal`：关闭 `FSWatcher`，从 Map 中删除。
  - `unwatchAll`：遍历 Map 关闭所有 watcher 并清空。
  - 验收标准：调用后不再触发事件，无内存泄漏。

## 4. MCP Event Consumer Integration

- [ ] 4.1 修改 `src/main/services/lineage/mcp-event-consumer.ts`：
  - 在消费 `McpProposalEvent` 并调用 `recordProposal()` 建立 lineage 绑定后，调用 `proposalStatusService.watchProposal(projectPath, changeId, sessionId)`。
  - `projectPath` 可从 MCP server 注入的环境变量 `FYLLO_PROJECT_PATH` 或通过 lineage 上下文获取；优先使用与 `recordProposal` 一致的 projectPath。
  - 验收标准：`create-proposal` 成功后，主进程开始监听对应 `.openspec.yaml` 并广播 creating/draft 状态。

- [ ] 4.2 确保 `ensureLineageEventConsumer` 在 chat 页面生命周期内可用：
  - 当前 `ensureLineageEventConsumer` 只在 `chat:listSessions` handler 中触发。验证进入 chat 页面时该函数会被调用；若不会，在 `src/main/ipc/chat.ts` 中合适的 handler（如 `chat:loadMessages` 或新增初始化入口）中补充调用。
  - 验收标准：用户在 chat 页面内时，Agent 调用 `create-proposal` 的事件能被消费。

## 5. IPC Broadcast Layer

- [ ] 5.1 在 `src/main/ipc/proposal.ts` 中新增 `setupProposalStatusBroadcast(mainWindow: BrowserWindow): void`：
  - 内部保存 `mainWindow` 引用。
  - 订阅 `proposalStatusService.onStatusChanged`。
  - 在回调中检查 `mainWindow.isDestroyed()`，若未销毁则调用 `mainWindow.webContents.send(ProposalChannels.statusChanged, payload)`。
  - 窗口重建时更新引用。
  - 验收标准：状态变化时 renderer 能收到 `proposal:statusChanged` 事件。

- [ ] 5.2 在 `src/main/bootstrap/index.ts` 中挂载 broadcast：
  - 在 `createMainWindow()` 后调用 `setupProposalStatusBroadcast(mainWindow)`。
  - 在 `app.on("activate")` 重建窗口时也调用 `setupProposalStatusBroadcast(reopenedWindow)`。
  - 验收标准：应用启动和窗口重建后，proposal 状态广播均正常工作。

## 6. Preload API

- [ ] 6.1 在 `src/preload/api/proposal.ts` 中新增 `onStatusChanged`：

  ```ts
  onStatusChanged(
    listener: (payload: ProposalStatusChangedPayload) => void
  ): () => void {
    const handler = (_event: IpcRendererEvent, payload: ProposalStatusChangedPayload) => {
      listener(payload);
    };
    ipcRenderer.on(ProposalChannels.statusChanged, handler);
    return () => {
      ipcRenderer.off(ProposalChannels.statusChanged, handler);
    };
  }
  ```

  - 验收标准：renderer 可调用 `proposalApi.onStatusChanged` 并正确取消订阅。

- [ ] 6.2 在 `src/preload/index.d.ts` 的 `ProposalApi` 接口中补充 `onStatusChanged` 类型声明。
  - 验收标准：`pnpm typecheck` 通过。

## 7. Renderer Stores

- [ ] 7.1 扩展 `src/renderer/src/stores/session.ts`：
  - 新增 `sessionProposals: Ref<Record<string, ProposalMeta[]>>`。
  - 新增 helper `getSessionProposals(sessionId: string): ProposalMeta[]`。
  - 新增 helper `upsertSessionProposal(sessionId: string, proposal: ProposalMeta): void`。
  - 新增 helper `removeSessionProposal(sessionId: string, changeId: string): void`。
  - 验收标准：store 提供的方法可在组件中使用。

- [ ] 7.2 在 `useSessionStore` 初始化时订阅 proposal 状态推送：
  - 调用 `proposalApi.onStatusChanged((payload) => { ... })`。
  - 收到事件后：
    - 如果 `payload.removed === true`，调用 `removeSessionProposal(payload.sessionId, payload.changeId)`。
    - 否则，构造/更新 `ProposalMeta` 并调用 `upsertSessionProposal`。
  - 保存取消订阅函数，store 注销时调用。
  - 验收标准：收到 `proposal:statusChanged` 后 store 状态正确更新。

- [ ] 7.3 在切换 active session 或初始化时回填历史 proposals：
  - 当 `activeSession.id` 变化时，如果 `sessionProposals[activeSession.id]` 为空，从 `useProposalStore().proposals` 中过滤出与该 session 关联的 proposals 填入。
  - 关联关系通过 `proposal.id` 与 lineage 数据匹配实现；如果当前 lineage 数据不足，至少保证未来状态推送能增量补充。
  - 验收标准：切换 session 后 EventRail 正确展示历史 proposal。

## 8. UI Components

- [ ] 8.1 创建 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`：
  - Props：
    ```ts
    proposals: ProposalMeta[]
    ```
  - 内部使用 `useProjectStore()`、`useWorkflowStore()`、`useProposalRunStore()`。
  - 每行渲染：
    - proposal 标题
    - 状态 badge（复用 `ProposalDetailHeader.vue` 中的 `statusConfig` 映射，或新建一致映射）
    - 操作区：
      - `status === "draft"`：显示 `UDropdownMenu` 按钮“开始实现”，items 为 `workflowStore.customTemplates.map(t => ({ label: t.name, onSelect: () => startApply(proposal, t.id) }))`。
      - `status === "applying" && proposalRunStore.runMeta?.status === "done" && proposalRunStore.runMeta?.changeId === proposal.id`：显示“归档”按钮，点击调用 `proposalRunStore.startArchive(projectId, proposal.id)`。
      - 其他状态：显示“查看详情”链接，点击 `router.push(`/proposal/${proposal.id}`)`。
  - 在 workflow 未加载时点击“开始实现”，先调用 `workflowStore.fetchTemplates()` 并显示 loading。
  - 验收标准：组件渲染符合设计，操作按钮状态正确，点击后调用正确的 store action。

- [ ] 8.2 修改 `src/renderer/src/components/chat/event/ChatSessionEventRail.vue`：
  - 在 `ChatPlanPanel` 之后新增 `ChatProposalPanel` 区块。
  - 从 `useSessionStore()` 获取 `sessionProposals[activeSession.id]` 并传入 `ChatProposalPanel`。
  - 如果当前 session 没有 proposal，默认隐藏该区块（或显示空状态提示）。
  - 验收标准：rail 正确展示 proposal 列表，无 proposal 时不占用显著空间。

- [ ] 8.3 修改 `src/renderer/src/components/chat/ChatContainer.vue`：
  - 确认 `ChatSessionEventRail` 已获得所需 props；如需要，将 `sessionProposals` 或相关数据流传递给 rail。
  - 验收标准：`ChatContainer` 渲染不报错，rail 数据正确。

- [ ] 8.4 修改 `src/renderer/src/pages/chat.vue`：
  - 在页面挂载时调用 `useWorkflowStore().fetchTemplates()`，确保用户点击“开始实现”时 workflows 已可用。
  - 验收标准：进入 chat 页面后 `workflowStore.customTemplates` 非空（如果项目有 workflows）。

## 9. Integration and Manual Verification

- [ ] 9.1 端到端验证 creating → draft：
  - 在 chat 页面让 Agent 调用 `create-proposal`。
  - 验证 EventRail 中先出现 creating，随后变为 draft。
  - 验收标准：状态变化在 2 秒内反映到 UI。

- [ ] 9.2 端到端验证 draft → applying：
  - 在 EventRail 中点击“开始实现”选择 workflow。
  - 验证 EventRail 状态变为 applying，且不显示执行日志。
  - 验收标准：apply 正常启动，状态正确更新。

- [ ] 9.3 端到端验证 applying → archived：
  - 等待 apply 完成（或在测试中构造 runMeta.status === "done"）。
  - 在 EventRail 中点击“归档”。
  - 验证 EventRail 状态变为 archived。
  - 验收标准：目录移动到 archive，状态正确更新。

- [ ] 9.4 验证 linked worktree 场景：
  - 在 linked worktree 中创建 proposal。
  - 验证 EventRail 正确显示 creating/draft。
  - 在 linked worktree 中归档。
  - 验证 EventRail 正确显示 archived。
  - 验收标准：worktree 场景与 main worktree 行为一致。

## 10. Testing

- [ ] 10.1 为 `resolveChangeDirAnywhere` 添加单元测试（`test/main/infra/proposal/openspec-reader.test.ts` 或新建文件）：
  - 覆盖 main active、main archive、worktree active、worktree archive、not found。
  - 验收标准：所有新增测试通过。

- [ ] 10.2 为 `ProposalStatusService` 添加单元测试（`test/main/services/proposal/proposal-status-service.test.ts`）：
  - 覆盖 status 变化、archive 移动、删除事件、重复 watch。
  - 验收标准：所有新增测试通过。

- [ ] 10.3 为 `ChatProposalPanel` 添加组件测试（`test/renderer/components/chat/event/ChatProposalPanel.test.ts`）：
  - 覆盖 draft 状态显示“开始实现”、applying 状态不显示归档、applying+done 状态显示归档。
  - 验收标准：所有新增测试通过。

## 11. Documentation and Guidelines

- [ ] 11.1 更新 `guidelines/IPC.md`：
  - 在“主进程主动向渲染进程推送事件”章节中补充 `proposal:statusChanged` 作为新增示例。
  - 验收标准：文档中提及新 channel 及其用途。

- [ ] 11.2 更新 `guidelines/RendererProcess.md`（如其中有 chat 组件或 store 相关章节）：
  - 简要说明 `useSessionStore.sessionProposals` 的用途。
  - 验收标准：文档与代码一致。

## 1. 数据契约与 overview 投影

- [x] 1.1 修改 `src/shared/types/overview.ts` 的 `ActiveChange` 类型，新增可选字段 `worktreePath?: string`；保持 `status` 仍为 `ActiveChangeStatus`，不新增 overview 专属状态枚举。
- [x] 1.2 修改 `src/main/services/overview/overview-service.ts` 的 `computeActiveChanges()`，在从 `ProposalMeta` 构造 `ActiveChange` 时传出 `worktreePath: proposal.worktreePath`；继续过滤 `archived` proposal，并保留 `getByProposal()` 失败时返回 null task 信息的现有行为。
- [x] 1.3 更新 `test/main/services/overview/overview-service.spec.ts`，为至少一个 active proposal fixture 设置 `worktreePath`，断言 `overview.activeChanges` 返回该路径；同时保留 archived proposal 不进入 `activeChanges` 的断言。

## 2. 共享 linked worktree indicator

- [x] 2.1 新增 `src/renderer/src/components/proposal/ProposalWorktreeBadge.vue`，接收 `worktreePath?: string | null`；当路径为空时不渲染内容，当路径存在时渲染 `i-lucide-git-branch` icon，并通过 `UTooltip`、`title` 或等价可访问属性展示完整 worktree 路径。
- [x] 2.2 在 `ProposalWorktreeBadge.vue` 上提供稳定测试入口，例如 `data-test="proposal-worktree-badge"`，并设置包含完整路径的可访问名称；icon-only 视觉不得只有颜色表达状态。
- [x] 2.3 新增或更新 renderer 组件测试，覆盖 `ProposalWorktreeBadge` 有 `worktreePath` 时显示 indicator 与路径提示、无 `worktreePath` 时不渲染。

## 3. 简化 `/proposal` 页面

- [x] 3.1 修改 `src/renderer/src/pages/proposal.vue`，删除 `selectedFilter`、`filterTabs`、`stats`、`filteredProposals` 和 `UTabs`，列表直接渲染 `store.proposals`。
- [x] 3.2 调整 `/proposal` 页面成功态布局，使外层使用与治理入口一致的 `bg-elevated` 应用内容背景和 `bg-default` 列表内容面板；保留 `PageHeader`、加载态、错误态和点击 proposal 卡片调用 `openProposalDetail(proposal.id)` 的行为。
- [x] 3.3 将 `/proposal` 空状态文案改为完整列表语义，例如“暂无 proposal”，不得继续提示用户切换筛选条件。
- [x] 3.4 在 `/proposal` proposal 卡片中使用 `ProposalWorktreeBadge` 展示 `proposal.worktreePath`；移除页面内联的 `git-branch + worktree` markup，确保 hover/focus 可看到完整路径。
- [x] 3.5 更新 `test/renderer/src/pages/proposal.spec.ts`：删除状态 tabs 交互断言；断言不同状态 proposal 同时可见、stats/tabs 不存在、点击卡片仍打开 detail slideover、linked worktree proposal 显示 worktree indicator。

## 4. overview 与 EventRail 卡片

- [x] 4.1 修改 `src/renderer/src/components/overview/OverviewActiveChanges.vue`，导入并使用 `ProposalWorktreeBadge`；当 `change.worktreePath` 存在时在 active proposal 卡片 meta 区展示 indicator，保留状态 badge、创建时间和点击打开 detail 行为。
- [x] 4.2 更新 `test/renderer/src/pages/overview.spec.ts`，在 `activeChanges` fixture 中加入 `worktreePath`，断言 overview active proposal 卡片显示 linked worktree indicator，并保留 `openProposalDetail(change.id)` 断言。
- [x] 4.3 修改 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`，导入并使用 `ProposalWorktreeBadge`；当 `proposal.worktreePath` 存在时在 proposal 卡片标题/id/status 区域展示 indicator，保留开始实现、查看详情、归档按钮逻辑。
- [x] 4.4 更新 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`，为带 `worktreePath` 的 proposal 断言 indicator 和路径提示存在，并为无 `worktreePath` 的 proposal 断言 indicator 不存在。
- [x] 4.5 修改 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`，将 proposal 卡片中的 `proposal.id` 描述替换为 `why` 摘要，并使用 `timeAgo` 展示创建时间且不加“创建于”前缀；当 `totalTasks > 0` 时展示 `doneTasks/totalTasks` 任务进度，同时更新 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts` 覆盖这些文本。

## 5. IPC 使用审计与验证

- [x] 5.1 在实现中确认 `/proposal` stats/tabs 删除后没有产生新的无调用方 proposal IPC；不得删除或修改 `stageStreamCancel`、`archiveCancel`、`proposalRunStore.cancelRun()`。
- [x] 5.2 保留 `proposal:list`、`proposal:readFile`、`proposal:getSpecDeltas`、apply/archive/run-history/status watch 的现有 preload、renderer wrapper、main handler 和 schema；只有在实现中发现本次改动直接造成的无调用方函数时才删除，并同步删除对应测试。
- [x] 5.3 运行 `pnpm exec vitest run --project renderer` 和 `pnpm exec vitest run --project main`；如果时间允许，再运行 `pnpm typecheck`。

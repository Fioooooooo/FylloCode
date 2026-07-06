## Context

当前 `/proposal` 页面在 `src/renderer/src/pages/proposal.vue` 中按顶级页面形态渲染：`PageHeader` 后展示三张统计卡、`UTabs` 状态筛选，再渲染 proposal 卡片列表。统计和筛选完全由 renderer 根据 `useProposalStore().proposals` 本地计算，没有独立 IPC。

overview 治理健康区已经把“能力规约”“归档提案”“项目准则”作为并列入口导航到 `/specs`、`/proposal`、`/guidelines`。`/specs` 与 `/guidelines` 都使用 `bg-elevated` 页面 shell、`bg-default` 内容面板、左侧列表和右侧只读详情；proposal 详情则不同，它包含开始实现、归档、运行历史和 side panel，并且同一个 `ProposalDetailSlideover` 需要被 `/proposal`、overview active changes 和对话 EventRail 复用。

linked worktree 信息已经存在于 `ProposalMeta.worktreePath`。`proposal:list` 通过 `readProposalFiles()` 读取 main workspace 和 `.worktrees/*/openspec/changes`，并在 worktree proposal 上返回 `worktreePath`。overview 的 `ActiveChange` 当前只投影 id、title、createdAt、task 信息和 status，因此无法显示 linked worktree indicator。

## Goals / Non-Goals

**Goals:**

- 让 `/proposal` 成为直接、完整的 proposal 列表页，不再展示页面级 stats 或状态 tabs。
- 让 `/proposal` 的视觉层级靠近 `/specs`、`/guidelines` 入口页，但保留 proposal detail slideover 作为详情入口。
- 在 `/proposal`、overview active changes、对话 EventRail proposal 卡片中统一展示 linked worktree icon。
- hover/focus linked worktree icon 时显示实际 `worktreePath`，帮助用户判断使用的是哪个 worktree。
- 复用现有 `ProposalMeta.worktreePath` 和 `readProposalFiles()` 检测逻辑，不新增 proposal 或 overview IPC channel。

**Non-Goals:**

- 不把 `/proposal` 改成左侧列表 + 右侧内嵌详情 pane。该重构需要拆分 `ProposalDetailSlideover` 的详情、运行和归档逻辑，本次不做。
- 不移除或修改 `stageStreamCancel`、`archiveCancel`、`proposalRunStore.cancelRun()`。
- 不移除 `proposal:list`、`proposal:readFile`、`proposal:getSpecDeltas`、apply/archive/run-history/status watch 相关 IPC；这些通道仍有明确调用方。
- 不改变 proposal apply、archive、run history 的行为。

## Decisions

### 1. `/proposal` 保留列表 + slideover，而不是改成 `/specs` 风格的右侧详情 pane

`/specs` 和 `/guidelines` 的详情内容是只读浏览，适合常驻右侧 pane。proposal detail 是可执行工作流界面，包含 workflow 菜单、archive 操作、运行历史、apply side panel，并且同一个详情入口需要被 overview 和 EventRail 复用。保持 `ProposalDetailSlideover` 能避免把同一套复杂工作流逻辑复制到 `/proposal` 页面。

备选方案是把 `/proposal` 改成左侧列表 + 右侧详情。该方案能在视觉上完全对齐 `/specs`、`/guidelines`，但会扩大实现范围，并引入 slideover 与 pane 两套详情容器之间的状态同步问题。

### 2. `/proposal` 删除 stats/tabs 后直接使用 `store.proposals`

stats 和 tabs 是 renderer 本地派生状态，不对应独立 IPC。实现时应删除 `selectedFilter`、`filterTabs`、`stats`、`filteredProposals` 和 `UTabs`，列表直接遍历 `store.proposals`。空状态文案应从“暂无匹配的 proposal”改为“暂无 proposal”。

### 3. 使用共享 `ProposalWorktreeBadge` 展示 linked worktree

新增 `src/renderer/src/components/proposal/ProposalWorktreeBadge.vue`，接收 `worktreePath?: string | null`。当路径不存在时组件不渲染；存在时渲染 linked worktree icon，并通过 `UTooltip` 或等价可访问提示展示完整路径。组件应提供稳定 `data-test`，并设置可访问名称，例如 `Linked worktree: <path>`。

备选方案是在三个卡片里各写一段 icon markup。该方案改动少，但会让 hover 文案、aria-label 和视觉密度分叉，不利于后续统一调整。

### 4. overview active changes 增加 `worktreePath?: string`

`computeActiveChanges()` 已经从 `readProposalFiles(projectPath)` 获取 `ProposalMeta[]`。实现时只需要在返回 `ActiveChange` 时增加 `worktreePath: proposal.worktreePath`，并在 `src/shared/types/overview.ts` 上声明该可选字段。该字段不需要 schema 变更，因为 overview IPC 当前只校验输入。

### 5. 本次不做 proposal IPC 删除

页面 stats/tabs 的删除不会产生新的无调用方 IPC。`proposal:list` 仍被 `useProposalStore.loadProposals()` 使用，并服务 `/proposal`、EventRail backfill 和归档后的 metadata 刷新；detail 相关 IPC 仍被 `ProposalDetailSlideover` 使用；apply/archive/run-history/status watch 仍被 proposal run store 和 session store 使用。

## Risks / Trade-offs

- [Risk] `/proposal` 不改成右侧详情 pane，视觉上不会与 `/specs`、`/guidelines` 完全一致。→ Mitigation：统一外层 shell、列表密度、卡片层级和空态，让它作为治理入口显得同组；详情继续使用跨入口 slideover。
- [Risk] EventRail 中的 proposal 可能来自 status push fallback，未必总有完整 `worktreePath`。→ Mitigation：只在 `ProposalMeta.worktreePath` 存在时显示 indicator；session backfill 已通过 `proposal:list` 获取完整 meta。
- [Risk] overview active changes 数据形状扩展可能遗漏测试 fixture。→ Mitigation：更新 shared 类型、main service fixture 和 renderer overview 测试，覆盖有/无 worktree 两种情况。
- [Risk] tooltip 在测试 stub 中不渲染真实浮层。→ Mitigation：共享组件提供 `aria-label`、`title` 或稳定 DOM 属性，测试不依赖 Nuxt UI 内部浮层实现。

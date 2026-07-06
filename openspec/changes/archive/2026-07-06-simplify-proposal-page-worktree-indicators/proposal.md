## Why

`/proposal` 以前是顶级入口页，保留了页面级统计和状态筛选；现在入口已经收敛到 overview 治理健康区，与 `/specs`、`/guidelines` 同属治理入口，旧的 stats 和 tabs 让页面层级显得重复。与此同时，proposal 卡片在多个入口展示，但只有 `/proposal` 列表能看出某个提案是否来自 linked worktree，overview 和对话 EventRail 缺少同样的上下文。

## What Changes

- 简化 `/proposal` 页面：移除顶部统计卡、状态 tabs 和本地状态筛选，页面直接展示当前项目完整 proposal 列表。
- 调整 `/proposal` 的页面布局，使其视觉层级与 `/specs`、`/guidelines` 这类 overview statsbar 入口保持一致，但继续用现有 proposal detail slideover 打开详情。
- 在 proposal 卡片中统一展示 linked worktree icon：`/proposal` 列表、overview 的 active changes 卡片、对话页 EventRail 的 `ChatProposalPanel` 都在 proposal 使用 linked worktree 时显示该图标。
- linked worktree icon 在 hover/focus 时展示实际使用的 worktree 路径。
- overview active changes 数据增加可选 `worktreePath`，从现有 `readProposalFiles()` / `ProposalMeta.worktreePath` 投影，不新增 overview IPC channel。
- 不改动 apply/archive 取消链路：`stageStreamCancel`、`archiveCancel` 和 `proposalRunStore.cancelRun()` 保持现状，后续另行处理。

## Capabilities

### New Capabilities

- `proposal-browser`: 约束 `/proposal` 页面作为完整 proposal 列表入口，以及 proposal 卡片上的 linked worktree 展示规则。

### Modified Capabilities

- `project-overview`: overview active proposal 卡片在 linked worktree 存在时展示 worktree indicator，并由 `overview:getProjectOverview` 暴露对应 metadata。

## Impact

- Renderer 页面与组件：`src/renderer/src/pages/proposal.vue`、`src/renderer/src/components/overview/OverviewActiveChanges.vue`、`src/renderer/src/components/chat/event/ChatProposalPanel.vue`，以及新增共享 worktree indicator 组件。
- Shared/main overview 数据：`src/shared/types/overview.ts`、`src/main/services/overview/overview-service.ts`。
- Tests：proposal 页面、overview 页面、ChatProposalPanel、overview service，以及新增共享 indicator 组件测试。
- IPC 清理评估：本次删除 stats/tabs 不产生可删除的 proposal IPC；`proposal:list`、detail 文件读取、spec delta、apply/archive/run-history/status watch 仍有调用方。

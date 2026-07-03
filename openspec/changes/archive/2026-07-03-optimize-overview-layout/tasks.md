## 1. Overview 信息架构

- [x] 1.1 修改 `src/renderer/src/pages/overview.vue` 的成功态布局，将 `OverviewActiveChanges` 和 `OverviewRecentLineages` 放入左侧动态数据区域，将 `OverviewStatsBar` 和 `OverviewGovernance` 放入右侧静态治理区域；保留现有 `useOverviewStore()` 加载流程、页面 header、loading、error 分支。
- [x] 1.2 调整 `src/renderer/src/pages/overview.vue` 的加载骨架，使 skeleton 在桌面宽度下反映左宽右窄双栏，在窄窗口下可堆叠；验收标准是 `data-test="overview-loading-skeleton"` 仍存在，且不引入横向滚动。

## 2. 动态数据组件

- [x] 2.1 修改 `src/renderer/src/components/overview/OverviewActiveChanges.vue`，保留现有 props、`openProposalDetail(change.id)` 行为和空状态；将提案卡片调整为 `bg-default` 加边框的卡片表面，并继续通过现有 stage 文案展示状态。
- [x] 2.2 修改 `src/renderer/src/components/overview/OverviewRecentLineages.vue`，保留现有 props、空状态和每条脉络的信息字段；为非空列表增加左侧时间轴节点和节点间连线，使用主题色表达时间线层级但不引入外部依赖。

## 3. 静态治理组件

- [x] 3.1 修改 `src/renderer/src/components/overview/OverviewStatsBar.vue`，将原顶部 4 指标整合为右侧“治理健康”卡；使用 `stats.taskLinkedRatio` 派生主覆盖率文案，并保留 specs 卡跳转 `/specs`、archives 卡跳转 `/proposal`、guidelines 与 lineages 不跳转的行为。
- [x] 3.2 修改 `src/renderer/src/components/overview/OverviewGovernance.vue`，让规约增长和准则演化适合右侧上下布局；规约增长柱状图使用主题色深浅递进表达趋势，准则演化保留现有文件名、提交信息和更新时间展示。
- [x] 3.3 确认首轮布局实现未修改 `src/shared/types/overview.ts`、`src/renderer/src/stores/overview.ts`、`src/preload/api/overview.ts` 和 main 进程 overview service。

## 4. Renderer 测试与验证

- [x] 4.1 更新 `test/renderer/src/pages/overview.spec.ts`，覆盖成功态包含动态数据区域、静态治理区域、治理健康、规约增长、准则演化和最近脉络时间轴的可测试标识或关键文本；测试不得断言具体字号、色值或像素级布局。
- [x] 4.2 保留并更新现有交互测试：点击进行中提案仍调用 `openProposalDetail`，点击能力规约入口仍导航 `/specs`，点击归档提案入口仍导航 `/proposal`，非交互指标不触发导航。
- [x] 4.3 运行 `pnpm exec vitest run --project renderer test/renderer/src/pages/overview.spec.ts` 和 `pnpm typecheck:web`；若失败，修复与本变更相关的问题后再结束 Apply。

## 5. Proposal 状态统一

- [x] 5.1 修改 `src/shared/types/overview.ts`，移除 `OverviewChangeStage` 或停止导出该专用状态；将 `ActiveChange` 的状态字段从 `stage` 调整为 `status`，类型为 `Exclude<ProposalStatus, "archived">` 或等价的 `creating | draft | applying`。
- [x] 5.2 修改 `src/main/services/overview/overview-service.ts`，删除 `mapStage()`，在 `computeActiveChanges()` 中继续过滤 `archived` proposal，并让 active change 直接返回 `status: proposal.status`。
- [x] 5.3 修改 `src/renderer/src/components/overview/OverviewActiveChanges.vue`，移除本地 `stageConfig`，导入并使用 `proposalDisplayStatusConfig` 渲染右上角 badge；badge 文案和颜色应与 proposal 详情一致。
- [x] 5.4 更新 `test/main/services/overview/overview-service.spec.ts`，断言 active changes 返回 `status: "creating" | "draft" | "applying"`，并移除 unknown status fallback 到 `drafting` 的断言。
- [x] 5.5 更新 `test/renderer/src/pages/overview.spec.ts`，用新的 `status` 字段构造 fixture，并断言进行中提案状态展示使用 `proposalDisplayStatusConfig` 对应文案。
- [x] 5.6 运行 `pnpm exec vitest run --project main test/main/services/overview/overview-service.spec.ts`、`pnpm exec vitest run --project renderer test/renderer/src/pages/overview.spec.ts` 和 `pnpm typecheck:web`；若失败，修复与状态统一相关的问题后再结束 Apply。

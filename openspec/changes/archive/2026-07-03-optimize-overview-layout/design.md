## Context

当前 overview 页面在 `src/renderer/src/pages/overview.vue` 中按顺序渲染 `OverviewStatsBar`、`OverviewActiveChanges`、`OverviewRecentLineages` 和 `OverviewGovernance`。数据已由 `ProjectOverview` 提供，覆盖率在 `stats.taskLinkedRatio`，治理增长和准则演化在 `governance`。

进行中提案的状态目前在主进程中从 `ProposalStatus` 映射为 `OverviewChangeStage`：`creating -> drafting`、`draft -> proposal`、`applying -> applying`。renderer 若要复用 `proposalDisplayStatusConfig`，还需要再把 `OverviewChangeStage` 映射回 proposal 展示状态。这种来回转换没有增加业务信息，应在本变更中统一。

相关约束：

- renderer 页面应继续使用 `useOverviewStore()` 加载数据，不直接调用 `window.api`。
- overview active change 的状态应与 proposal 状态模型保持一致，避免主进程和 renderer 维护两套等价状态命名。
- 页面视觉应遵守 `guidelines/UiDesign.md`：使用语义 token、有限边界、现有 `UiSurface` / `AppEmptyState` 模式，不引入一次性全局样式。
- proposal 只锁定用户可感知的信息结构和交互保留，不锁定具体字号、像素级间距或精确色值。

## Goals / Non-Goals

**Goals:**

- 将 overview 的已加载态分成动态数据区域和静态治理区域，让用户快速区分“正在推进什么”和“项目治理状态如何”。
- 左侧动态区域展示进行中的提案和最近脉络；最近脉络使用时间轴表达记录顺序。
- 右侧静态区域展示治理健康、规约增长、准则演化；治理健康整合现有 4 类指标并突出覆盖率。
- 保留现有交互：点击能力规约指标进入 `/specs`，点击归档提案指标进入 `/proposal`，点击进行中提案打开 proposal detail slideover。
- 让进行中提案状态直接使用非归档 proposal 状态，renderer 复用 `proposalDisplayStatusConfig`。
- 保留现有加载、错误、空状态语义。

**Non-Goals:**

- 不新增 overview IPC 通道，不新增后端统计字段，不修改 `OverviewStats`、`GovernanceEvolution`、`RecentLineage` 的数据含义。
- 不改变 main 进程统计计算、缓存或 Git 查询逻辑。
- 不在 spec 或 design 中规定标题具体颜色、字号、圆角大小、精确栏宽或逐像素布局。
- 不新增图表库或外部 UI 依赖。

## Decisions

### 1. 用页面布局承载双栏，而不是改数据层

`ProjectOverview` 已经将页面所需数据分为 `stats`、`activeChanges`、`recentLineages` 和 `governance`。Apply 阶段应在 `overview.vue` 中重新组织组件位置，将左栏用于 `OverviewActiveChanges` 和 `OverviewRecentLineages`，右栏用于 `OverviewStatsBar` 与 `OverviewGovernance` 内的治理内容。

备选方案是新增后端字段来表达栏目，但这会扩大契约面且没有必要。

### 2. 保留现有组件边界，但允许调整组件内部呈现

`OverviewActiveChanges`、`OverviewRecentLineages`、`OverviewStatsBar`、`OverviewGovernance` 已经对应用户要保留的内容块。Apply 阶段优先在这些组件内调整结构与样式，必要时可以从 `OverviewGovernance` 中拆出小型内部组件，但不要把所有 markup 合并到 `overview.vue`。

备选方案是新建一个大组件重写 overview，但会降低现有测试和复用边界的价值。

### 3. 治理健康使用现有覆盖率作为主指标

治理健康主百分比使用 `stats.taskLinkedRatio` 派生；当 `stats.totalSubjects === 0` 时沿用现有无脉络回退语义，不制造虚假的百分比。现有 4 类指标仍应可见，其中 specs 与 archives 继续保持导航能力。

备选方案是引入新的健康分，但当前 IPC 未定义该字段，且用户已确认这次是前端结构优化。

### 4. 视觉细节由 Apply 阶段在 UI 指南内决定

本 proposal 约束卡片背景层级、动态/静态分组、时间轴和增长图的表达方向，但不锁定具体色值或字号。Apply 阶段可以使用语义 token、主题色透明度和响应式 grid/flex 组合，在视觉 QA 中迭代细节。

### 5. active change 状态直接使用 proposal 状态模型

`ActiveChange` 应将状态字段统一为 proposal 的非归档状态：`creating | draft | applying`。主进程继续过滤 `archived` proposal，但不再调用 `mapStage()` 将其改名为 `drafting | proposal | applying`。renderer 的 `OverviewActiveChanges` 直接用 `proposalDisplayStatusConfig[change.status]` 渲染 badge。

备选方案是在 renderer 中增加 `drafting -> creating`、`proposal -> draft`、`applying -> applying` 的反向映射。该方案能工作，但会保留主进程与 renderer 的重复映射，不利于长期维护。

## Risks / Trade-offs

- [风险] 右栏内容过窄导致文案拥挤。→ Apply 阶段应选择左宽右窄但不极端的比例，并在窄窗口下堆叠。
- [风险] 治理健康主色背景与 UI 指南中“不要大面积装饰色”的约束冲突。→ 只在治理健康这一关键状态卡中使用主题强调，其余卡片保持语义表面和边框。
- [风险] 时间轴视觉过度定制，后续维护困难。→ 使用 Tailwind 语义 class 和简单 DOM 结构实现，不引入外部依赖。
- [风险] active change 状态字段改名会影响 main/renderer 测试和任何读取 `ActiveChange.stage` 的代码。→ 通过 TypeScript 类型更新暴露所有调用点，并同步更新测试断言。
- [风险] 测试过度绑定样式类导致返工成本高。→ renderer 测试应验证结构、关键文案和交互，不断言具体颜色、字号或精确 class 组合。

## Context

当前 `ProjectOverview.stats.specsCount` 只统计 `openspec/specs/` 下目录数，`OverviewStatsBar` 的「能力规约」卡片在规范中被定义为纯展示。用户已经在主工作区验证了一个静态 UI 原型，并确认最终方向：只读、从概览卡片下钻、不做编辑、不做 family/category 分类、不依赖 spec 中不存在的 title 字段、不把 anchors 作为 schema 字段。

现有 `ProposalMarkdownContent.vue` 使用 `MarkStream` 渲染 markdown，这可以复用于 Requirement body 与 Scenario body。但 specs 浏览页不应整篇渲染 `spec.md`，否则 `# title` 和 `## Purpose` 会与详情 header 重复，且大量 Requirements 缺少快速定位。

## Goals / Non-Goals

**Goals:**

- 提供 `/specs` 只读页面，展示当前项目 `openspec/specs/*/spec.md`。
- 从 markdown 解析出 `purpose`、Requirement groups、Scenario groups、source path、更新时间与统计数量。
- 左侧 capability 列表只显示 id 和 Purpose 单行摘要。
- 右侧详情 header 紧凑展示 id、purpose、source path、更新时间、Requirements/Scenarios 统计。
- 右侧正文以结构化 Requirement/Scenario 展示：Requirement 快速定位目录 + 平铺阅读内容 + Scenario timeline 视觉。
- Requirement/Scenario body 继续用 `MarkStream` 渲染 markdown，保留 bold、code、list 等 markdown 语义。

**Non-Goals:**

- 不提供编辑、新建、删除、保存或 archive specs 的能力。
- 不引入 spec category/family/title/anchors 等当前 `spec.md` 没有的持久字段。
- 不把 `/specs` 加入 ActivityBar 主导航。
- 不改变 OpenSpec 文件格式；解析只消费当前 markdown 结构。

## Decisions

### Decision: 新增 specs browser IPC，而不是扩展 ProjectOverview DTO

`ProjectOverview` 目前是概览页聚合 DTO，适合数量、趋势和最近脉络，不适合承载所有 `spec.md` 内容。新增 `specs:getSpecsBrowser` IPC，可保持概览加载轻量，也避免每次进入概览页都读取并解析大量 markdown。

主进程新增 `src/main/services/specs/specs-browser-service.ts`，读取 `openspec/specs` 下一级目录中的 `spec.md`。renderer 通过 `src/renderer/src/api/specs.ts` 与 `useSpecsStore` 获取数据，页面不直接访问 `window.api`。

### Decision: 解析 markdown 结构，但正文仍交给 MarkStream

解析器只负责结构边界：

- `# ...`：忽略，不进入 DTO。
- `## Purpose`：提取为 `purpose`，详情 header 展示，不在正文重复渲染。
- `### Requirement: <name>` 或 `### 要求：<name>`：创建 `RequirementGroup.title`。
- `#### Scenario: <name>` 或 `#### 场景：<name>`：创建 `ScenarioGroup.title`。
- Requirement 标题之后、首个 Scenario 之前的 markdown 归入 `RequirementGroup.body`。
- Scenario 标题之后、下一个 Scenario/Requirement 之前的 markdown 归入 `ScenarioGroup.body`。

Vue 组件负责结构和布局；`MarkStream` 只渲染 body 字段，避免丢失 `**WHEN**`、inline code、列表和未来可能出现的 mermaid/katex 等 markdown 能力。

### Decision: Requirement 快速定位由前端从 requirementGroups 派生

不在 DTO 中增加 `anchors` 字段。页面左侧 capability 列表负责能力切换；详情内部增加 Requirements 快速索引栏，直接遍历 `selectedSpec.requirementGroups`，点击后滚动到对应 DOM id。这样目录不会与数据源漂移，也避免把纯 UI 派生状态固化进 shared type。

### Decision: UI 延续静态原型的三栏结构

页面主体使用现有应用 shell 内的 `bg-elevated space-x-2` 模式：

- 左栏：`w-80` capability 列表，使用 `UiSurface as="button" variant="flat" padding="none"`，每项只显示 id + Purpose 单行摘要。
- 中栏：`w-64` Requirement 快速索引，来源为当前 spec 的 requirementGroups。
- 右侧：详情阅读区，header 在顶部，正文滚动。Requirement 不使用 `UiSurface` 卡片；Requirement 之间用分割线，Scenario 用纵向 timeline 线串联。

## Risks / Trade-offs

- Markdown 解析边界不完整 → 解析器只支持当前 OpenSpec 标准结构，并为缺失 Purpose、缺失 Scenario 的文件提供降级展示和测试覆盖。
- 大量 specs 或大型 spec.md 导致首次加载慢 → specs browser 数据按进入页面时加载，概览不预取；初版不做缓存，后续根据实测再加 TTL 或 store-level 缓存。
- 双语 header 兼容风险 → 解析器同时支持 `Requirement:` / `要求：` 与 `Scenario:` / `场景：`，避免当前历史文件混用中英文时无法展示。
- 当前 main worktree 有静态原型残留 → 本 change 的 implementation 应在 linked worktree 内以复制过来的原型为基线，后续是否清理 main prototype 由用户另行决定。

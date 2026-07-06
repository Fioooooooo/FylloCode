# project-overview Specification

## Purpose

TBD - created by archiving change optimize-overview-layout. Update Purpose after archive.

## Requirements

### Requirement: Overview separates dynamic work from static governance

系统 SHALL 在项目概览数据加载成功后，将 overview 页面内容组织为动态数据区域和静态治理区域。

#### Scenario: Loaded overview data is grouped by information type

- **WHEN** 用户打开 overview 页面且 `overview:getProjectOverview` 返回项目概览数据
- **THEN** 页面 SHALL 展示动态数据区域，包含进行中的提案和最近脉络
- **AND** 页面 SHALL 展示静态治理区域，包含治理健康、规约增长和准则演化
- **AND** 页面 SHALL NOT 将所有内容按单一瀑布流顺序无分组堆叠展示

#### Scenario: Narrow viewport preserves grouping

- **WHEN** overview 页面在无法舒适展示双栏的窄窗口中渲染
- **THEN** 页面 MAY 将动态数据区域和静态治理区域上下堆叠
- **AND** 堆叠后 SHALL 保持动态数据与静态治理的分组边界可辨认

### Requirement: Dynamic overview area preserves active proposal interactions

系统 SHALL 在动态数据区域展示进行中的提案，并保留现有 proposal 详情打开能力。

#### Scenario: Active proposal cards open proposal detail

- **WHEN** overview 页面展示进行中的提案
- **THEN** 每个可见提案 SHALL 展示提案标题、来源任务信息或自由讨论回退、proposal 状态和创建时间信息
- **AND** 用户点击提案卡片时 SHALL 打开对应 proposal detail slideover

#### Scenario: Active proposal status uses proposal model

- **WHEN** `overview:getProjectOverview` 返回 `activeChanges`
- **THEN** 每个 active change SHALL 暴露 proposal 的非归档状态，取值为 `creating`、`draft` 或 `applying`
- **AND** 系统 SHALL NOT 将这些状态映射为 overview 专属的 `drafting` 或 `proposal`
- **AND** 状态为 `archived` 的 proposal SHALL NOT 出现在 `activeChanges` 中

#### Scenario: Active proposals empty state remains explicit

- **WHEN** overview 数据中的 `activeChanges` 为空
- **THEN** 动态数据区域 SHALL 展示进行中提案的空状态
- **AND** 空状态 SHALL NOT 移除最近脉络区域或静态治理区域

### Requirement: Recent lineage appears as a timeline

系统 SHALL 在动态数据区域以时间轴形式展示最近脉络。

#### Scenario: Recent lineages render with timeline affordance

- **WHEN** overview 数据中的 `recentLineages` 非空
- **THEN** 最近脉络区域 SHALL 为每条脉络展示一个可辨认的时间轴节点
- **AND** 相邻脉络节点之间 SHALL 使用连线表达顺序关系
- **AND** 每条脉络 SHALL 继续展示来源、标题或自由讨论回退、更新时间、session 数量、proposal 数量和 proposal 状态信息

#### Scenario: Recent lineages empty state remains explicit

- **WHEN** overview 数据中的 `recentLineages` 为空
- **THEN** 动态数据区域 SHALL 展示最近脉络的空状态
- **AND** 空状态 SHALL NOT 移除进行中提案区域或静态治理区域

### Requirement: Static governance area summarizes health and evolution

系统 SHALL 在静态治理区域展示治理健康、规约增长和准则演化。

#### Scenario: Governance health summarizes existing stats

- **WHEN** overview 页面展示静态治理区域
- **THEN** 治理健康 SHALL 使用现有 `OverviewStats` 数据展示项目治理摘要
- **AND** 治理健康 SHALL 突出展示溯源覆盖率，覆盖率由 `taskLinkedRatio` 派生
- **AND** 治理健康 SHALL 囊括能力规约数量、归档提案数量、项目准则数量和溯源覆盖信息
- **AND** 项目准则数量 SHALL 按 `guidelines/**/*.md` 递归统计

#### Scenario: Existing stat navigation remains available

- **WHEN** 用户点击治理健康中的能力规约入口
- **THEN** 系统 SHALL 导航到 `/specs`
- **AND** 当用户点击治理健康中的归档提案入口
- **THEN** 系统 SHALL 导航到 `/proposal`
- **AND** 当用户点击治理健康中的项目准则入口
- **THEN** 系统 SHALL 导航到 `/guidelines`

#### Scenario: Governance evolution content remains visible

- **WHEN** overview 页面展示静态治理区域
- **THEN** 规约增长 SHALL 展示 `governance.specsGrowth` 的累计趋势
- **AND** 准则演化 SHALL 展示 `governance.recentGuidelines` 的最近更新列表或对应空状态

### Requirement: Overview loading and failure states remain page-level

系统 SHALL 保留 overview 页面现有加载和错误状态语义。

#### Scenario: Loading state appears before overview data resolves

- **WHEN** 当前项目存在且 overview 数据请求尚未完成
- **THEN** 页面 SHALL 展示 overview 加载状态
- **AND** 页面 SHALL NOT 展示过期的项目概览数据作为当前项目结果

#### Scenario: Error state appears when overview loading fails

- **WHEN** overview 数据请求失败
- **THEN** 页面 SHALL 展示错误状态和错误信息
- **AND** 页面 SHALL NOT 展示动态数据区域或静态治理区域作为成功结果

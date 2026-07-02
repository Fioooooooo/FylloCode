---
sidebar:
  group: 产品功能
  order: 20
---

# 项目概览

项目概览是进入项目后的默认首屏。它把治理状态、进行中的变更、最近的 lineage 脉络和规范演化趋势聚合到一页，让你在开始新工作前先看到项目的真实状态。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/project-overview.png" alt="项目概览页面截图" />
</figure>

页面数据全部来自项目本地：仓库文件扫描、git 历史查询和 lineage 投影，不依赖任何外部服务。

## 统计卡片

页面顶部的四张卡片回答“这个项目治理到什么程度了”：

| 卡片 | 口径 |
| --- | --- |
| 能力规约 | `openspec/specs/` 下的规范数量，以及本月新增数 |
| 归档提案 | `openspec/changes/archive/` 下的归档数量，以及本月新增数 |
| 项目准则 | `guidelines/` 顶层 Markdown 文件数量，以及最近一次更新时间 |
| 溯源覆盖 | 已关联任务的 lineage 脉络占比，以及脉络总数 |

溯源覆盖按“是否已关联任务”统计：从对话直接发起、后来补建了任务的脉络同样计入。这个指标越高，说明团队的变更越多地从明确的任务入口进入治理流程。

## 进行中

展示当前所有未归档的活跃提案。每个提案会显示所处阶段——草拟（drafting）、提案（proposal）或 Apply（applying）——并通过 lineage 反查出它来自哪个任务。点击条目可直接进入对应的 [Proposal 详情](/docs/features/proposal)。

## 最近脉络

按更新时间倒序展示最近 10 条 lineage 脉络。每条脉络显示：

- 起源：来自任务，还是直接从对话发起
- 关联的任务标题与任务引用
- 串联的会话数和产出的 proposal 数
- 合并状态：`applying`（有 proposal 正在进行）或 `pending`

这里是观察“一条需求走到了哪一步”的入口。关于脉络如何建立和串联，见 [Lineage 追溯链路](/docs/guide/lineage)。

## 治理演化

基于 git 历史展示项目规范的长期趋势：

- **规约增长**：近 8 周 specs 存量的周度趋势，反映规范沉淀的速度
- **准则演化**：`guidelines/` 最近更新的 5 个 guideline 文件、时间和提交说明，反映团队约定的活跃度

## 数据口径与刷新

- 仓库扫描和 lineage 投影每次进入页面实时读取
- git 历史查询按项目缓存 60 秒，短时间内反复进入不会重复执行 git 命令
- 项目缺少 `openspec/`、`guidelines/` 目录，或不是 git 仓库时，对应区块显示为空，不影响页面其余部分

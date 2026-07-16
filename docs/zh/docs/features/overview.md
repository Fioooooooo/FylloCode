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

## 页面结构

页面把信息分为两组：左侧动态工作区展示进行中的 Proposal 和最近脉络，右侧静态治理区展示治理健康、规约增长和准则演化。窄窗口会把两组内容上下排列，但不会混合它们的职责。

## 治理健康

治理健康卡片用环形比例显示已关联任务的 lineage subject 占比。从对话直接发起、后来补建任务的 subject 同样计入。没有脉络时显示暂无可评估数据。

卡片下方提供五个治理入口：

| 入口 | 口径与目标 |
| --- | --- |
| 能力规约 | 显示 `openspec/specs/` 下的规约数量，进入 `/specs` |
| 归档提案 | 显示 `openspec/changes/archive/` 下的归档数量，进入 `/proposal` |
| 项目准则 | 递归统计 `guidelines/**/*.md`，进入 `/guidelines` |
| 知识沉淀 | 显示 knowledge 条目与扫描错误总数，进入 `/knowledge` |
| 工作脉络 | 显示项目 lineage subject 总数，进入 `/lineage` |

知识沉淀正在加载或失败时只影响该入口，不会让 Overview 主数据进入页面级错误。存在 `suspect`、`unknown` 或扫描错误时，入口会用提示图标和可访问文字显示需关注数量。

## 进行中

展示当前所有未归档的活跃 Proposal。每个条目会显示 `creating`、`draft` 或 `applying` 状态，并通过 lineage 反查来源任务；linked worktree Proposal 还会显示可查看完整路径的 indicator。点击条目可直接进入对应的 [Proposal 详情](/docs/features/proposal)。

## 最近脉络

按更新时间倒序展示最近 10 条 lineage 脉络。每条脉络显示：

- 起源：来自任务，还是直接从对话发起
- 关联的任务标题与任务引用
- 串联的会话数和产出的 proposal 数
- Proposal 状态信息

这里用于快速观察近期工作。需要浏览全部 subject、筛选状态或按 Session 查看 Plan、Proposal 与 Commit 时，进入[工作脉络](/docs/features/lineage)。关于脉络如何建立和串联，见 [Lineage 追溯链路](/docs/guide/lineage)。

## 治理演化

基于 git 历史展示项目规范的长期趋势：

- **规约增长**：近 8 周 specs 存量的周度趋势，反映规范沉淀的速度
- **准则演化**：`guidelines/` 最近更新的 5 个 guideline 文件、时间和提交说明，反映团队约定的活跃度

## 数据口径与刷新

- 仓库扫描和 lineage 投影每次进入页面实时读取
- git 历史查询按项目缓存 60 秒，短时间内反复进入不会重复执行 git 命令
- 项目缺少 `openspec/`、`guidelines/` 目录，或不是 git 仓库时，对应区块显示为空，不影响页面其余部分

---
sidebar:
  group: 产品功能
  order: 20
---

# 项目概览

项目概览是打开 Workspace 后的默认首屏。它按 Project 聚合治理状态、进行中的变更、最近的 lineage 脉络和规范演化趋势，让你在开始新工作前先看到整个 Workspace 及各成员 Project 的真实状态。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/project-overview.png" alt="项目概览页面截图" />
</figure>

同一页面会根据当前窗口身份展示 Project 或 Workspace 视角：下面的截图展示包含多个 Project 的 Workspace 概览。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/workspace-overview.png" alt="Workspace 概览页面截图" />
</figure>

页面数据全部来自当前 Workspace 的本地数据：各 Project 的仓库文件扫描、git 历史查询和 Workspace lineage 投影，不依赖任何外部服务。

## 页面结构

页面把信息分为两组：左侧动态工作区展示进行中的 Proposal 和最近脉络，右侧静态治理区展示治理健康、规约增长和准则演化。窄窗口会把两组内容上下排列，但不会混合它们的职责。

## 治理健康

治理健康卡片用环形比例显示已关联任务的 lineage subject 占比。从对话直接发起、后来补建任务的 subject 同样计入。没有脉络时显示暂无可评估数据。

卡片下方提供五个治理入口：

| 入口 | 口径与目标 |
| --- | --- |
| 能力规约 | 聚合 Workspace 各 Project 的 `openspec/specs/`，进入 `/specs` |
| 归档提案 | 聚合各 Project 的 `openspec/changes/archive/`，进入 `/proposal` |
| 项目准则 | 聚合各 Project 的 `guidelines/**/*.md`，进入 `/guidelines` |
| 知识沉淀 | 显示 Workspace knowledge 条目与扫描错误总数，进入 `/knowledge` |
| 工作脉络 | 显示 Workspace lineage subject 总数，进入 `/lineage` |

知识沉淀正在加载或失败时只影响该入口，不会让 Overview 主数据进入页面级错误。存在 `suspect`、`unknown` 或扫描错误时，入口会用提示图标和可访问文字显示需关注数量。

## 进行中

展示当前 Workspace 内所有 Project 的未归档活跃 Proposal。每个条目会显示 `creating`、`draft` 或 `applying` 状态、所属 Project 和 repository-owned 归属；linked worktree Proposal 还会显示可查看完整路径的 indicator。点击条目可直接进入对应的 [Proposal 详情](/docs/features/proposal)。

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

- 仓库扫描和 lineage 投影每次进入页面实时读取，并保留 Project 归属
- git 历史查询按 Project 缓存 60 秒，短时间内反复进入不会重复执行 git 命令
- Project 缺少 `openspec/`、`guidelines/` 目录时，对应治理统计显示为空；没有 Git 历史时仅 Git evolution 显示为空，其余治理信息仍可用

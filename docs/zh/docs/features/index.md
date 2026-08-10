---
sidebar:
  group: 产品功能
  groupOrder: 20
  order: 10
---

# 功能总览

FylloCode 按 Workspace 中一次 Agent 编码任务的治理路径组织功能。

## 产品路径

| 页面 | 解决的问题 |
| --- | --- |
| [项目概览](/docs/features/overview) | 进入 Workspace 的默认首屏，按 Project 聚合治理状态、进行中变更、最近脉络和规范演化趋势 |
| [多根 Workspace](/docs/features/multi-root-workspace) | 在一个窗口中组织多个 Project，让 Agent 在授权范围内同时读取多个项目目录 |
| [任务看板](/docs/features/task) | 集中管理任务入口，从本地任务或研发系统任务发起讨论 |
| [对话与执行](/docs/features/chat) | 在固定的 Workspace Session scope 中选择 FylloCode 或原生模式，与 Agent 对齐问题、委派任务和推进执行 |
| [Proposal 评审](/docs/features/proposal) | 查看 proposal、design、tasks，再从 Chat 会话事件栏推进 Apply & Archive |
| [Workflow 编排](/docs/features/workflow) | 用 YAML 固化已经认可的执行阶段和 Agent 分工 |
| [知识沉淀](/docs/features/knowledge) | 浏览由 Agent 标记、经用户确认后沉淀的 Workspace 级知识条目 |
| [项目准则](/docs/features/guidelines) | 按 Project 浏览 Agent 维护的仓库工程约定 |
| [能力规约](/docs/features/specs) | 按 Project 浏览 Proposal 归档后同步生成的 OpenSpec 能力规约 |
| [工作脉络](/docs/features/lineage) | 浏览 Workspace 的全部 lineage subject，按 Session 追溯 Plan、Proposal 与 Commit |
| [ACP Agents](/docs/features/agents) | 安装、识别和管理支持 ACP 的 Coding Agent |
| [研发系统集成](/docs/features/integrations) | 连接云效等研发系统，把任务结果回写到现有工具链 |
| [设置](/docs/features/settings) | 管理应用偏好、ACP Agents、服务连接和版本信息 |

## 推荐理解方式

先从一个 Task 开始，在 Chat 中判断这次改动该走[直接实现、Plan 还是 Proposal](/docs/guide/change-paths)，再沿 Apply & Archive 看完整流程。这是日常使用的主线。需要拆分独立工作时，FylloCode 模式中的 Agent 还可以通过 [`fyllo-spawn`](/docs/reference/fyllo-spawn) 委派给其他已安装的 ACP Agent。知识沉淀、项目准则、能力规约和工作脉络提供背景：前两者由 `fyllo-cortex` 在明确检查点辅助 Agent 维护，能力规约是 Proposal 归档后的正式契约，工作脉络则是浏览[串联主线各步骤的 lineage](/docs/guide/lineage)的入口。ACP Agents、研发系统集成和设置是支撑能力。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/proposal-detail.png" alt="Proposal 详情页截图" />
</figure>

---
sidebar:
  group: 产品功能
  groupOrder: 20
  order: 10
---

# 功能总览

FylloCode 的功能不是按“聊天工具”组织的，而是按一次 Agent 编码任务的治理路径组织的。

## 产品路径

| 页面 | 解决的问题 |
| --- | --- |
| [项目概览](/docs/features/overview) | 进入项目的默认首屏，聚合治理状态、进行中变更、最近脉络和规范演化趋势 |
| [任务看板](/docs/features/task) | 集中管理任务入口，从本地任务或研发系统任务发起讨论 |
| [对话与执行](/docs/features/chat) | 在同一个项目上下文中与 Agent 对齐问题、生成方案和推进执行 |
| [Proposal 评审](/docs/features/proposal) | 查看 proposal、design、tasks，并执行 Apply & Archive |
| [Workflow 编排](/docs/features/workflow) | 用 YAML 固化已经认可的执行阶段和 Agent 分工 |
| [知识沉淀](/docs/features/knowledge) | 浏览由 Agent 标记、经用户确认后沉淀的项目级知识条目 |
| [项目准则](/docs/features/guidelines) | 浏览 Agent 维护的项目工程约定 |
| [能力规约](/docs/features/specs) | 浏览 Proposal 归档后同步生成的 OpenSpec 能力规约 |
| [工作脉络](/docs/features/lineage) | 浏览项目的全部 lineage subject，按 Session 追溯 Plan、Proposal 与 Commit |
| [ACP Agents](/docs/features/agents) | 安装、识别和管理支持 ACP 的 Coding Agent |
| [研发系统集成](/docs/features/integrations) | 连接云效等研发系统，把任务结果回写到现有工具链 |
| [设置](/docs/features/settings) | 管理应用偏好、ACP Agents、服务连接和版本信息 |

## 推荐理解方式

先从一个 Task 开始，在 Chat 中判断这次改动该走[直接实现、Plan 还是 Proposal](/docs/guide/workflow)，再沿 Apply & Archive 看完整流程——这是日常会用到的主线页面。知识沉淀、项目准则、能力规约和工作脉络是背景知识：前两者由 `fyllo-cortex` 辅助 Agent 在明确检查点维护，能力规约是 Proposal 归档后的正式契约，工作脉络则是[串联主线各步骤的 lineage](/docs/guide/lineage) 的完整浏览入口。ACP Agents、研发系统集成和设置是支撑能力。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/proposal-detail.png" alt="Proposal 详情页截图" />
</figure>

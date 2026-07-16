---
sidebar:
  group: 指南
  groupOrder: 10
  order: 10
  text: 概览
---

# 文档

FylloCode 是面向持续使用 Coding Agent 的桌面应用。它不直接替代 IDE、CI/CD 或项目管理系统，而是在这些工具之上补一层持久、结构化、可追溯的治理层。

这组文档先回答三个问题：

- 为什么普通 Agent 会话很难支撑长期工程协作
- 如何把一次编码任务拆成可评审、可执行、可归档的流程
- 如何在本地开始使用 FylloCode

## 推荐阅读顺序

1. [为什么需要 FylloCode](/docs/guide/why)
2. [快速开始](/docs/guide/getting-started)
3. [三线工作方式](/docs/guide/workflow)
4. [Lineage 追溯链路](/docs/guide/lineage)

想参与项目开发，可以继续阅读[贡献指南](/docs/contributing)和[用 FylloCode 开发 FylloCode](/docs/guide/develop-with-fyllocode)。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| Task | 主线起点，可直接创建或从研发系统同步，作为后续协作的统一入口 |
| Chat | 与 Agent 厘清意图、检索佐证、权衡取舍，共同收敛出最终决策，并判断这次改动该走哪条执行路径 |
| Plan | 会话级轻量实施计划，适合需要梳理思路但不改变行为契约的工作；一旦发现涉及契约变化需升级为 Proposal |
| Proposal | 面向契约变化的方案评审实体，通常包含 proposal、design、specs、tasks 四类产物 |
| Apply & Archive | 在已确认边界内执行实现，并归档决策、实现结果、spec 更新（如涉及）和 guidelines 演进 |
| [guideline](/docs/features/guidelines) | 项目自己的工程约定，由 Agent 在 Chat、Apply、Archive 几个检查点自驱动维护，跟真实代码保持同步 |
| [knowledge](/docs/features/knowledge) | 跨任务、跨会话共享的项目级事实积累，由 Agent 按一套判断标准（flag test）识别并沉淀 |
| [lineage](/docs/guide/lineage) | 串联一次变更各阶段的可追溯线索，让固化结果自动作用到下一次任务 |
| [fyllo-action](/docs/reference/fyllo-action) | ACP Agent 与 FylloCode 交互的结构化通道，用于任务创建、plan 审阅、knowledge 标记与复核 |
| fyllo-specs | 内置 MCP server，围绕 OpenSpec 暴露项目规范、Plan 与 Proposal 工作流 |
| fyllo-cortex | 内置 MCP server，提供 guidelines、knowledge 与 lineage 工具，用于沉淀项目工程知识并追溯设计决策 |

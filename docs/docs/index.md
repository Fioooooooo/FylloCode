---
sidebar:
  group: 指南
  groupOrder: 10
  order: 10
  text: 概览
---

# 文档

FylloCode 是面向团队使用 Coding Agent 的桌面应用。它不直接替代 IDE、CI/CD 或项目管理系统，而是在这些工具之上补一层持久、结构化、可追溯的治理层。

这组文档先回答三个问题：

- 为什么普通 Agent 会话很难支撑长期团队协作
- 如何把一次编码任务拆成可评审、可执行、可归档的流程
- 如何在本地开始使用 FylloCode

## 推荐阅读顺序

1. [为什么需要 FylloCode](/docs/guide/why)
2. [快速开始](/docs/guide/getting-started)
3. [四阶段工作流](/docs/guide/workflow)
4. [Lineage 追溯链路](/docs/guide/lineage)

想参与项目开发，可以继续阅读[贡献指南](/docs/contributing)和[用 FylloCode 开发 FylloCode](/docs/guide/develop-with-fyllocode)。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| Task | 主线起点，可由团队成员创建或从研发系统同步，作为后续协作的统一入口 |
| Chat | 与 Agent 厘清意图、检索佐证、权衡取舍，共同收敛出最终决策 |
| Proposal | 方案评审实体，通常包含 proposal、design、specs、tasks 四类产物 |
| Apply & Archive | 在已确认任务边界内执行实现，并归档决策、实现结果、spec 更新和 guidelines 演进 |
| [lineage](/docs/guide/lineage) | 串联一次变更各阶段的可追溯线索，让固化结果自动作用到下一次任务 |
| fyllo-specs | 内置 MCP server，围绕 OpenSpec 暴露项目规范和变更工作流 |
| fyllo-skills | 内置 MCP server，目前提供 guidelines 工具，用于沉淀项目工程约定 |

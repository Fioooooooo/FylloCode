---
sidebar:
  group: 指南
  order: 40
---

# 三线工作方式

FylloCode 不强制一条流水线。Task、Chat 之后，Agent 和你需要先做一个判断：这次改动要走哪条执行路径。

| 路径 | 适用场景 | 产出 |
| --- | --- | --- |
| 直接实现 | 改动范围明确，不涉及架构取舍，不改变对外契约 | 代码变更本身 |
| Plan | 需要先梳理思路、比较方案，但不改变行为契约 | 一份会话级 plan 文档 |
| Proposal | 会改变公开 API、schema、协议、持久化格式、用户可见行为或职责边界 | proposal、design、specs、tasks 四件套 |

三条路径不是三个独立入口，而是同一次讨论里可以逐步升级的选择：先判断要不要 Plan，Plan 过程中如果发现会动到契约，再升级到 Proposal。每一步的输入、决策和产物都会被记录进同一条 [lineage](/docs/guide/lineage)。

## 为什么不是一条固定流水线

FylloCode 最初把 OpenSpec 提案当成唯一的执行路径：任何改动都要先出 proposal、design、specs、tasks 四件套。用下来发现这套流程对小改动太重——修一个文案、调一处参数，也要走完整套评审产物，团队会绕开它。

现在的做法是把"要不要评审"交给改动本身的性质判断，而不是流程规定：只有真正涉及契约变化的改动才需要 Proposal 的评审重量，其余情况可以用更轻的方式推进，同时保留同一条 lineage 追溯链路。

## 直接实现

不经过 `fyllo-specs` 的 `create-plan` 或 `create-proposal`，Agent 在 Chat 阶段确认方案后直接修改代码。

适合：

- 改动范围能一眼看清，不需要额外记录设计取舍
- 不涉及需求、公开 API、schema、协议、持久化格式或用户可见行为的变化
- 无需团队评审即可合入

## Plan

Plan 是会话级的轻量实施计划，写在当前会话目录下的一份 Markdown 文件里，不依赖 OpenSpec 结构，也不创建 linked worktree。

适合需要先梳理思路、权衡方案，但确认不会改变行为契约的工作：

- 任务目标、范围边界、关键约束
- 方案取舍
- 实施步骤
- 验证方式

Agent 写完 plan 后，会通过 `plan.create` 这个 [fyllo-action](/docs/reference/fyllo-action) 卡片交给你审阅；你确认后，FylloCode 打开该 plan 文档供你查看和批准，Agent 随后按批准的 plan 执行。

### 什么时候必须从 Plan 升级到 Proposal

在写 plan 的过程中，一旦发现这次改动实际上会触及以下任意一项，就必须停下来，改用 `create-proposal` 创建正式提案，而不是继续完成这份 plan：

- 改变了需求或功能范围
- 改变了公开 API
- 改变了 schema 或持久化格式
- 改变了协议（例如 IPC 契约）
- 改变了用户可见行为
- 改变了模块职责边界

这个判断没有中间地带：只要命中一条，就必须升级，不能"先按 plan 做，之后再补 proposal"。

## Proposal

Proposal 面向会改变对外契约的变更，围绕 OpenSpec 生成四类产物：

- `proposal.md`：背景、能力变化、影响模块
- `design.md`：目标、非目标、关键设计决策、被放弃方案
- `specs`：本次变更沉淀出的规范条目
- `tasks.md`：Apply 阶段要执行的任务清单

这些产物既用于当前评审，也用于未来追溯。两个月后有人问"当时为什么这么设计"，应该能从 proposal 和 design 中找到答案。

默认情况下，`create-proposal` 会在 `.worktrees/<changeName>` 下创建 linked worktree，让改动发生在独立工作区，主分支在评审通过前保持干净；用户明确要求时才会直接在主工作区创建。

## Apply & Archive

无论走的是直接实现、Plan 还是 Proposal，落地后都可以进入 Archive：把变更范围、决策上下文、spec 更新（如果有）和 guidelines 演进沉淀下来，作为下一次任务的背景知识。

Proposal 路径的 Apply 阶段执行 `tasks.md`；Agent 应该：

- 读取 Proposal 产物和项目规范
- 只在已批准的任务边界内修改代码
- 按任务清单推进实现
- 补充必要的测试和验证结果
- 避免把未评审的新方案混入实现阶段

变更落地后，完整记录自动归档，归档内容包括：

- 本次代码变更范围
- Proposal 与 Design 决策上下文（Proposal 路径）
- specs 更新（Proposal 路径）
- guidelines 演进结果
- 执行和验证结果

归档让 lineage 闭环：下一次 Agent 会话不再从零开始，新的 Agent 可以读取已有规范、历史决策和团队约定，基于项目真实状态继续工作。

## 模型选择建议

不同阶段对模型能力的要求不同：

| 阶段 | 建议 |
| --- | --- |
| Chat / Plan / Proposal | 使用推理能力更强的模型，重点是理解项目背景、权衡方案和写出可审查产物 |
| Apply | 可以使用更快、更低成本的模型，因为任务边界已经由 plan 或 `tasks.md` 明确 |

常见做法是 Chat、Plan 与 Proposal 阶段使用更强的推理模型，Apply 阶段使用速度和成本更合适的模型。

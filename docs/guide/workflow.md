# 四阶段工作流

FylloCode 把每个编码任务拆成 Task、Proposal、Apply、Archive 四个阶段。每个阶段都有明确输入、产物和约束。

<figure class="fc-doc-image">
  <img src="/assets/diagrams/workflow-zh.svg" alt="FylloCode 四阶段工作流图" />
</figure>

## Task

Task 阶段负责在 Agent 写代码之前结构化任务意图。

需要明确的内容包括：

- 这次变更要解决的问题
- 变更范围和不在范围内的内容
- 项目已有约束和历史背景
- 验收标准
- 风险、假设和仍需确认的问题

这个阶段的关键是避免 Agent 在目标不清晰时直接进入实现。

## Proposal

Proposal 阶段负责把方案变成可评审的结构化产物。

默认情况下，Proposal 会围绕 OpenSpec 生成四类内容：

- `proposal.md`：背景、能力变化、影响模块
- `design.md`：目标、非目标、关键设计决策、被放弃方案
- `specs`：本次变更沉淀出的规范条目
- `tasks.md`：Apply 阶段要执行的任务清单

这些产物既用于当前评审，也用于未来追溯。两个月后有人问“当时为什么这么设计”，应该能从 proposal 和 design 中找到答案。

## Apply

Apply 阶段负责执行已确认的 `tasks.md`。

在这个阶段，Agent 应该：

- 读取 Proposal 产物和项目规范
- 只在已批准的任务边界内修改代码
- 按任务清单推进实现
- 补充必要的测试和验证结果
- 避免把未评审的新方案混入实现阶段

FylloCode 默认支持 linked worktree 工作方式，使 Apply 阶段的代码改动发生在独立工作区内，主分支在任务完成前保持干净。

## Archive

Archive 阶段负责把一次变更的完整记录沉淀下来。

归档内容包括：

- 本次代码变更范围
- Proposal 与 Design 决策上下文
- specs 更新
- guidelines 演进结果
- 执行和验证结果

Archive 的价值在于让下一次 Agent 会话不再从零开始。新的 Agent 可以读取已有规范、历史决策和团队约定，基于项目真实状态继续工作。

## 模型选择建议

不同阶段对模型能力的要求不同：

| 阶段 | 建议 |
| --- | --- |
| Proposal | 使用推理能力更强的模型，重点是理解项目背景、权衡方案和写出可审查产物 |
| Apply | 可以使用更快、更低成本的模型，因为任务边界已经由 `tasks.md` 明确 |

常见做法是 Proposal 阶段使用更强的推理模型，Apply 阶段使用速度和成本更合适的模型。

---
sidebar:
  group: 产品功能
  order: 50
---

# Proposal 评审

Proposal 页面是 FylloCode 的核心工作区之一。它把一次变更的方案、设计、任务拆分和归档状态集中展示出来。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/proposal-list.png" alt="Proposal 列表截图" />
</figure>

## Proposal 列表

列表页用于查看当前 Workspace 各 Project 中的完整 proposal 集合。页面可以按 Project 筛选，并显示 repository-owned 的归属；它不使用状态 tabs 隐藏草稿、实现中或已归档的 Proposal。同名 change 在不同 Project 中仍是彼此独立的 Proposal。

跨 Project 的目标不会合并为主 Project 拥有的 umbrella Proposal。Agent 会按 Project 独立判断 Direct、Plan 或 Proposal；多个 Project 都需要 Proposal 时，先列出 owner、具体契约变化和跨仓库依赖供确认，再为每个 Project 分别调用 `create-proposal`。每份 Proposal 只包含所属 Project 的契约和任务，跨 Project 前置关系只作为依赖记录。

## Proposal 详情

详情页通常包含：

- Proposal：说明为什么要做、改什么、影响哪些模块
- Design：记录关键设计决策、非目标和弃置方案
- Tasks：列出 Apply & Archive 阶段要执行的任务
- 运行状态与面板：在既有运行记录存在时展示 Apply & Archive 阶段的 Agent 输出

详情 Slideover 用于浏览产物和检查状态，不再从头部直接启动 Apply、Archive 或打开运行历史。生命周期操作从创建该 Proposal 的 Chat Session 继续推进。

## 从 Chat 推进 Apply & Archive

Chat 会话事件栏中的 Proposal 卡片提供当前可用的生命周期入口：

1. draft Proposal 显示“开始实现”。点击后，FylloCode 把包含 `changeId` 与所属 `folderId` 的用户消息发送到当前 Chat，由 Agent 进入 Apply。
2. Apply 期间，FylloCode 监听 `.openspec.yaml` 与 `tasks.md`。只有 status 为 `applying`、任务数大于零且全部任务完成时，卡片和详情才显示“可归档”。
3. “归档”同样发送包含完整 Proposal owner 的用户消息，不会在 Renderer 中直接修改状态。实际 Archive 完成后，Main watcher 重新加载 Proposal metadata，再更新会话事件栏。

Linked Proposal 归档后可能先位于 linked worktree，再随提交合并到所属 Project 的主工作区。FylloCode 会把这些位置视为同一个 Proposal 的迁移过程；旧 worktree 删除不会把已经迁移到 main archive 的 Proposal 误报为移除。

## 评审重点

评审 Proposal 时，建议重点看这些问题：

- 任务背景是否准确
- 方案是否覆盖了真实问题
- 非目标是否足够明确
- 是否有被放弃方案和理由
- tasks 是否细到可以执行和验收
- 影响范围是否和项目规范一致
- Proposal 是否属于正确的 Project，`folderId` 与仓库位置是否匹配
- 跨 Project 依赖是否明确记录，且 tasks 没有混入其他 Project 的文件修改

Proposal 通过后，回到创建它的 Chat Session，从会话事件栏进入 Apply & Archive，可以减少“实现中才发现方案不对”的返工成本。

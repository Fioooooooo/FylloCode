# Proposal 评审

Proposal 页面是 FylloCode 的核心工作区之一。它把一次变更的方案、设计、任务拆分和归档状态集中展示出来。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/proposal-list.png" alt="Proposal 列表截图" />
</figure>

## Proposal 列表

列表页用于查看当前项目中的 proposal 状态。它帮助团队识别哪些变更仍在草稿、哪些已经可以执行、哪些已经归档。

## Proposal 详情

<figure class="fc-doc-image">
  <img src="/assets/screenshots/proposal-detail.png" alt="Proposal 详情截图" />
</figure>

详情页通常包含：

- Proposal：说明为什么要做、改什么、影响哪些模块
- Design：记录关键设计决策、非目标和弃置方案
- Tasks：列出 Apply 阶段要执行的任务
- 运行面板：展示 Apply 或 Archive 阶段的 Agent 输出

## 评审重点

评审 Proposal 时，建议重点看这些问题：

- 任务背景是否准确
- 方案是否覆盖了真实问题
- 非目标是否足够明确
- 是否有被放弃方案和理由
- tasks 是否细到可以执行和验收
- 影响范围是否和项目规范一致

Proposal 通过后再进入 Apply，可以减少“实现中才发现方案不对”的返工成本。

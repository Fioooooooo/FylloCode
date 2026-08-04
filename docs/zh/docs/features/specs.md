---
sidebar:
  group: 产品功能
  order: 67
---

# 能力规约

能力规约页面用于浏览当前 Workspace 授权范围内各 Project 的 OpenSpec 能力规约（各仓库 `openspec/specs/` 下的 `spec.md`）。页面是只读的，规约内容由 [Proposal](/docs/features/proposal) 在所属 Project 归档时自动同步生成。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/specs.png" alt="能力规约页面截图" />
</figure>

## specs 是什么

Spec 描述项目某个能力的需求和验收场景，是 Proposal 走 [OpenSpec 路径](/docs/guide/workflow#proposal) 时沉淀下来的正式契约。一个 Proposal 归档后，其中涉及的能力变化会合并进对应的 spec 文件，成为项目规约的一部分。只有走 Proposal 路径并涉及需求或契约变化的改动，才会产生新的 spec。

## 页面结构

左侧按 Project 聚合列出当前 Workspace 的 spec，并显示能力 ID、归属和 Purpose 摘要；右侧显示选中 spec 的完整需求（requirement）列表，每条需求下展开对应的验收场景（scenario），并提供锚点导航方便在长文档中定位到具体需求。缺失或扫描失败的 Project 会以局部状态标记，不会冒充为空仓库。

## 与 Proposal 的关系

Spec 是 Proposal 评审通过、归档落地之后的结果，不是评审过程中的草稿。评审阶段的规约变化在 Proposal 详情页的 Specs 页签中查看，相关设计和执行拆分则分别位于 Design、Tasks 页签；归档之后，spec delta 才会合并并反映到这个页面。想知道某个能力当前的正式约定是什么，应该看这里而不是某个历史 Proposal。

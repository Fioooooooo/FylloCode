---
sidebar:
  group: 产品功能
  order: 65
---

# 知识沉淀

知识沉淀页面用于浏览、核查当前项目已沉淀的 knowledge 条目。条目正文以只读方式展示，条目的产生和更新由 Agent 在会话中通过 `fyllo-cortex` 的 `knowledge` 工具完成；不再需要的条目仍可从页面删除。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/knowledge.png" alt="知识沉淀页面截图" />
</figure>

## 什么会被沉淀为 knowledge

Knowledge 不是聊天记录的摘要，而是"如果丢了，未来某次会话会为此付出代价"的事实——需要重新推导、重新翻查代码或文档、或者会被理解错的信息。Agent 在会话中遵循一套判断标准（俗称 flag test）来识别这类信息，常见形态包括：

- **意外**：调查后发现现实和一个合理假设不一致
- **investigating 成本不成比例**：一次很长的排查或阅读，最后落脚到一个很小的结论
- **用户指令**：用户给出的、适用范围超出当前任务的要求或纠正
- **不可从仓库推导的背景**：只有用户能提供的业务或历史背景

日常任务型指令、可以从代码/specs/guidelines 里低成本重新推导出的事实、临时调试状态、密钥或个人信息，都不会被沉淀。

## 与对话的交互方式

Agent 发现一条候选知识时，会在回复中放置一张 `knowledge.flag` 卡片，会话事件栏也会汇总这条待处理记录。这是一次低成本的标记，不会打断当前讨论，也不需要你立刻回应。事件栏只负责展示和定位；当你在对话正文中确认任意一张待处理的 flag 卡片时，FylloCode 会把该会话中所有待处理的 flag 打包成一次 capture 请求，交给 Agent 写成正式的 knowledge 条目。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/knowledge-flag.png" alt="knowledge.flag 卡片截图" />
</figure>

Agent 完成写入后，会先用 knowledge scanner 校验条目，再放一张 `knowledge.review` 卡片。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/knowledge-capture.png" alt="knowledge capture 后请求审阅截图" />
</figure>

确认该卡片后，FylloCode 从磁盘打开这条 knowledge 的最新内容供你审阅。你可以在弹层中直接编辑完整 Markdown 原文；修改会实时保存，确认时还会等待最后一次保存完成。关于这两种卡片的完整交互规则，见 [fyllo-action](/docs/reference/fyllo-action)。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/knowledge-review.png" alt="knowledge 审阅弹层截图" />
</figure>

## 页面结构

左侧列出当前项目的全部 knowledge 条目，按类型分组（`project`、`reference`、`feedback`）；右侧显示选中条目的正文。条目上如果出现 `suspect` 或 `unknown` 状态标记，说明这条知识可能已经过期或来源存疑，建议在依赖它之前先核实。

条目可以被删除；删除操作不可撤销。

## 与 lineage 的关系

Knowledge 条目本身不直接挂在某一条 lineage 脉络上——它是跨任务、跨会话共享的项目级积累，而不是某一次变更的产物。它和 [guidelines](/docs/features/guidelines) 一起构成 `fyllo-cortex` 提供给后续 Agent 会话的项目背景，具体的存储位置、索引方式和判断标准细节见 [fyllo-cortex 参考](/docs/reference/fyllo-cortex)。

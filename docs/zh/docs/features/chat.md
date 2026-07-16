---
sidebar:
  group: 产品功能
  order: 40
---

# 对话与执行

对话页面承载项目上下文中的 Agent 协作，是主线上 Chat 阶段的落点。Agent 在这里分析需求、检索代码佐证、引导团队权衡取舍，与你一起收敛出决策，再继续推动 Proposal 和 Apply & Archive 阶段。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/chat.png" alt="对话页面截图" />
</figure>

## 主要能力

- 管理项目内的会话列表
- 选择已安装的 ACP Agent
- 发送文本和附件上下文
- 展示 Agent 的思考、工具调用和流式输出
- 支持 Mermaid、Markdown 等结构化内容展示
- 在任务上下文中推进 proposal 创建和后续阶段
- 从任务发起的会话显示来源任务横幅，重新进入会话仍可见
- Agent 可通过 [fyllo-action](/docs/reference/fyllo-action) 提议创建任务、提交 plan 审阅、标记或复核 knowledge，由你确认后由 FylloCode 接管执行

## 定位历史消息

对话区左上角会出现一条时间线，标记本次会话中你发送过的每一条消息。长对话中滚动查看时，时间线会跟随当前阅读位置高亮对应节点；点击某个节点会平滑滚动回那条消息。少于两条消息时时间线不显示。

## 会话事件栏

对话区右侧是可折叠的会话事件栏，收纳三类不会打断当前讨论、但需要留意的信息：

- **Agent 待办**：Agent 在本次会话中给出的执行项列表
- **Proposal 卡片**：本次会话中创建的 proposal 及其实时状态
- **fyllo-action 待处理项**：`knowledge.flag`、`knowledge.review` 等 rail 类型 action 的只读摘要和定位入口；确认操作仍在对话正文的内联卡片中完成

<figure class="fc-doc-image">
  <img src="/assets/screenshots/chat-rail.png" alt="会话事件栏截图" />
</figure>

事件栏可以随时折叠为窄条，展开状态会在会话间保持。

## 与 lineage 的关系

从任务发起的会话会自动绑定到该任务的 [lineage 脉络](/docs/guide/lineage)；直接发起的会话会创建一条 chat 起源的脉络，之后可以补建任务回到主线。会话中通过 `fyllo-specs` 创建的 proposal 也会自动记录到同一条脉络上，无需手动关联。

## 工作方式

普通 Agent 会话通常只有当前代码和本次 prompt。FylloCode 会把项目规范、历史决策、任务上下文和 guidelines 组织成 Agent 可读取的背景，让 Agent 在更明确的边界内工作。

对话页面的重点不是替代所有聊天工具，而是让聊天结果进入可治理流程：当问题收敛、决策确定后，应该生成 Proposal；Proposal 通过后进入 Apply & Archive，把实现与变更记录沉淀下来。

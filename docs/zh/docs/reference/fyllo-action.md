---
sidebar:
  group: 参考
  order: 35
---

# fyllo-action

`fyllo-action` 是 ACP Agent 与 FylloCode 交互的结构化通道。Agent 在回复文本中写入一个特定标签，FylloCode 把它渲染成可交互的卡片，用户确认后由 FylloCode 接管后续动作——而不是让 Agent 自己继续在对话里描述结果。

这条通道的存在，是因为一些动作（创建任务、打开 plan 审阅、请求确认知识条目）如果只靠 Agent 用文字描述"我已经……"，用户既无法真正确认，也难以追溯这个动作是否发生、发生了什么。fyllo-action 把这些动作变成一次明确的、用户可确认或取消的交互。

## 四种 Action

| Type | 呈现位置 | 触发方 | 确认后发生什么 |
| --- | --- | --- | --- |
| `task.create` | 对话正文内联卡片 | Agent 在讨论中识别到一个值得跟踪的后续任务 | FylloCode 创建本地任务，并把当前会话绑定到该任务的 lineage |
| `plan.create` | 对话正文内联卡片 | Agent 完成一份 [Plan](/docs/guide/workflow#plan) 文档 | FylloCode 打开该 plan 供你审阅；批准后 Agent 按 plan 执行 |
| `knowledge.flag` | 对话内联卡片 + 会话事件栏只读记录 | Agent 在讨论中发现一条值得沉淀的事实 | 不立即打断对话；你在内联卡片确认后，会话内所有待处理的 flag 会被打包成一次 capture 请求 |
| `knowledge.review` | 对话内联卡片 + 会话事件栏只读记录 | Agent 完成一次 knowledge capture，写入或更新了条目 | FylloCode 从磁盘打开该 knowledge 条目的最新内容供你编辑和审阅 |

四种 action 都会在对话正文中提供确认入口。`task.create` 和 `plan.create` 只以内联卡片呈现；`knowledge.flag` 和 `knowledge.review` 还会进入可折叠的会话事件栏，方便汇总和定位待处理项。事件栏本身是只读列表，不提供确认或沉淀按钮。

## 与 Agent 的边界

Agent 只负责生成结构化的 action 标签和必要字段，不负责执行动作本身：

- 不会自己创建任务文件，而是等待 `task.create` 被确认
- 不会把 plan 或 knowledge 条目的正文粘贴进对话，而是引用文件供 FylloCode 打开
- 每种 action 都有明确的 payload 约束（例如 `task.create` 每个会话最多出现一次、`knowledge.review` 每个条目最多一张待处理卡片），避免同一类卡片在一次会话里重复刷屏

## 与 lineage 的关系

`task.create` 被确认后创建的任务，会把当前会话回填到同一条 [lineage](/docs/guide/lineage) 脉络上，让"先聊起来再立项"的讨论也能进入可追溯的主线。Plan 在 `create-plan` 阶段已通过 MCP 事件关联到当前 Session；`plan.create` 只负责打开审阅，不会重复创建链接。`knowledge.flag` 和 `knowledge.review` 不直接产生独立的 lineage 链接。

## 适用场景

理解 fyllo-action 有助于判断"为什么 Agent 这次没有直接帮我建任务"或"为什么这条知识没有立刻写进项目"——这些动作都设计成需要你的一次确认，而不是 Agent 单方面决定。

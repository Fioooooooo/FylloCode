---
sidebar:
  group: 参考
  order: 36
---

# Fyllo Signal

Fyllo Signal 是 ACP Agent 在 Chat assistant 正文中输出的被动展示协议。它把一段符合 schema 的标签渲染为轻量视觉信息，不要求用户确认，也不会触发业务动作。

Fyllo Signal 与 [fyllo-action](/docs/reference/fyllo-action) 使用相同的顶层独立 Markdown block 边界，但承担不同职责：

| 协议 | 用途 | 用户操作 | 持久化与提醒 |
| --- | --- | --- | --- |
| `fyllo-action` | 请求 FylloCode 执行一个需要确认的动作 | 确认或取消 | 可产生 Action 状态，部分类型进入会话事件栏 |
| `fyllo-signal` | 展示 Agent 已经确定的轻量信息 | 无 | 不创建状态，不进入会话事件栏，不改变待处理数量 |

## 已启用类型

当前启用两种 Signal：

| 类型 | 用途 |
| --- | --- |
| `show.time` | 显示已经确定的日期或时间标签 |
| `spawn.session` | 打开由 [`fyllo-spawn`](/docs/reference/fyllo-spawn) 创建的 spawned Session 只读详情 |

`show.time` payload：

| 字段 | 约束 |
| --- | --- |
| `label` | 必填字符串，长度 1–200，不允许 CR 或 LF |

它用于响应当前日期或时间查询，并把 `label` 渲染为带时钟图标的非交互 pill。一次回复最多输出一个 `show.time`。

`spawn.session` payload 只接受一个不透明查询键：

| 字段 | 约束 |
| --- | --- |
| `sessionId` | 必填字符串，长度 1–256，不允许 `/`、`\` 或 NUL |

`spawn.session` 只是一个可选的上下文深链：Main 会自动把新建和续聊的 spawned Session 暴露到父 Chat 的活动视图，发现、状态更新和详情访问都不依赖 Signal。Agent 如果输出，只应在 `prompt_to_agent` 省略 `sessionId` 并成功创建新 spawned Session 时输出一次；继续已有 Session 时不重复输出。Payload 不能携带 Workspace、父 Session、Agent、状态、内容、response ID 或本地路径，这些事实都由 Main 查询并校验。

## 标签格式

真实 Signal 只能使用 `type` 属性，body 必须是与该类型 schema 匹配的严格 JSON object：

```html
<fyllo-signal type="show.time">
{
  "label": "2026-07-30 14:30"
}
</fyllo-signal>
```

上面的 fenced block 是协议示例，因此会保持普通代码文本。Agent 要发出真实 Signal 时，opening tag 必须从行首开始并独占顶层 Markdown block；前后如果还有说明文字，标签与说明之间必须保留空白行。Payload 字符串中的字面 `<` 和 `>` 需要分别编码为 `\u003c` 和 `\u003e`。

`spawn.session` 的格式相同，但 body 只包含 `sessionId`：

```html
<fyllo-signal type="spawn.session">
{
  "sessionId": "spawned-session-id"
}
</fyllo-signal>
```

## 解析与显示边界

只有 Chat 中的 assistant text part 会启用 Fyllo Signal。Specs、Guidelines、Knowledge、Proposal、user message、reasoning 和 tool 内容不会注册 Signal 标签，其中的相同文本按普通 Markdown 显示。

FylloCode 会等到 closing tag 到达且完整标签满足独立 block 边界后再渲染。未闭合标签保持普通 Markdown；已闭合但 type、JSON 或 payload 无效的标签显示通用 invalid Signal，不会调用具体类型组件。

Signal 的历史显示只依赖已保存的 assistant 文本重新解析。挂载或重新挂载 Signal 不会调用 Action IPC、写入 session `actionStates`、创建独立存储记录或影响 session attention。

`spawn.session` 使用承载该 assistant 消息的 Workspace 与父 Session 作为查询上下文，不会回退到当前打开的其他 Session。Main 会再次校验窗口、父 Session 和 spawned Session owner；未知、已删除或跨 owner 的目标统一显示不可用。打开详情不会创建、继续、取消或重试 spawned turn，也不会认领或投递后台完成通知。

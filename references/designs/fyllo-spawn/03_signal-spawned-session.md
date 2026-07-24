# fyllo-signal 集成：spawn.session

> 前置：
>
> - [01_fyllo-spawn-design.md](01_fyllo-spawn-design.md) Phase 1 已完成
> - [02_background-spawned-session.md](02_background-spawned-session.md) 已完成
> - fyllo-signal 通用基础设施已实现（见 `references/designs/fyllo-signal/design.md`）

## 概述

在 fyllo-spawn 场景下注册 `type="spawn.session"` 的 fyllo-signal，为用户提供 spawn session 的可视化入口和 background 任务进度展示。

本文档覆盖两部分用户交互：

1. **对话流行内 signal**：点击打开 slideover 查看 spawn session 详情
2. **全局 background 任务进度**：在 prompt 输入框旁展示进行中的 background session 状态

## Tool API 变更

### `prompt_to_agent` description 追加 fyllo-signal 指令

在 [02_background-spawned-session.md](02_background-spawned-session.md) 的 tool description 基础上追加：

```
When starting a new session (no sessionId), emit a <fyllo-signal type="spawn.session"> tag in your text output after receiving the response. This is not needed when continuing an existing session.
```

## 对话流行内 Signal

### 触发时机

主 agent 首次调用 `prompt_to_agent`（不传 sessionId，创建新 session）并拿到返回后，在文本输出中嵌入：

```
<fyllo-signal type="spawn.session">
{ "sessionId": "sess_abc123", "agentId": "codex-acp" }
</fyllo-signal>
```

续 session（传入已有 sessionId）时不再输出——对应的 signal 已在首次调用时嵌入。

### payload

| 字段      | 类型   | 说明                                |
| --------- | ------ | ----------------------------------- |
| sessionId | string | spawn session 的 fylloSessionId     |
| agentId   | string | 子 agent ID                         |
| label     | string | 可选，主 agent 对此次调用的简短描述 |

### 行内渲染

在对话流中渲染为轻量行内元素，展示子 agent 名称和可点击标记。不参与 EventRail，不强提醒。

### 状态实时更新

行内 signal 可以展示 spawn session 的实时状态（running / idle / error）。数据来源为 Phase 2 中主进程通过 `webContents.send()` 推送的事件：

- `spawn:started` → signal 展示 running 状态
- `spawn:done` → signal 更新为 idle 状态
- `spawn:error` → signal 更新为 error 状态

renderer 侧维护一份 spawn session 状态表（从 `spawn:*` 事件增量更新），signal 组件根据 sessionId 查表渲染当前状态。

## 点击行为：Slideover

点击 signal 打开 slideover，分三个区域：

### 区域 1：Prompt

展示主 agent 发给子 agent 的 prompt 文本。数据来源：`messages.jsonl` 中第一条 user message，或由主进程在 meta 中记录首次 prompt。

### 区域 2：Activity（默认折叠）

展示子 agent 的活动记录（thinking、tool calling 等），复用现有 `ChatActivityGroup` 组件。数据来源：`messages.jsonl` 中的 assistant message parts（tool call parts、reasoning parts）。

默认折叠，用户可展开查看全部活动。

### 区域 3：Transcript

展示子 agent 当前 turn 的文本输出，与主 agent 读到的 `response.md` 内容一致。用 MarkStream 渲染，外层 wrapper 对 `em` 元素设置 `display: none`，隐藏 tool call 标记行（`_[ToolName] title_` 格式），用户只看到干净的文本结论。

tool call 的详细信息已在区域 2 的 ChatActivityGroup 中完整展示，transcript 中不重复呈现。

### 双消费方设计

同一份 `response.md` 同时服务主 agent（读文件）和用户（slideover transcript 区域）：

- **主 agent**：Read tool 读取完整 Markdown，文本 + `_[ToolName] title_` 行都可见，了解子 agent 做了什么
- **用户**：slideover 的 transcript 区域用 MarkStream 渲染 response.md，外层 wrapper 对 `em` 元素设置 `display: none`，隐藏 tool call 行。用户只看到干净的文本输出，tool call 细节在上方 Activity 区域已完整展示

### 数据来源

Slideover 打开时，renderer 通过 IPC 从主进程获取数据：

- **内存数据**（SpawnedSessionEntry）：当前 status、recentActivity（running 态）
- **磁盘数据**：`meta.json`、`messages.jsonl`（ChatActivityGroup 渲染）、`response.md`（transcript 渲染）

running 态时 transcript 区域为空（response.md 尚未写入），activity 区域可实时更新（主进程推送 session/update 事件到 renderer）。

## 全局 Background 任务进度

### 入口

在 prompt 输入框旁边展示一个轻量的进度指示器（如小 loading icon），当有任何 background spawn session 处于 running 状态时可见。

### 交互

- **Hover**：tooltip 展示当前进行中的 background session 列表（agent 名称 + 简要描述）
- **Click**：展开面板或 popover，列出所有进行中的 background session，每条可点击跳转到对应的 slideover

### 数据来源

renderer 侧的 spawn session 状态表，从 `spawn:started` / `spawn:done` / `spawn:error` 事件增量维护。进行中的 session = 状态表中 status 为 running 的条目。

### 与行内 signal 的关系

全局进度指示器和行内 signal 展示的是同一份状态数据，只是入口不同：

- **行内 signal**：关联到具体的 `prompt_to_agent` tool call 位置，展示单个 session 的状态
- **全局进度**：聚合所有进行中的 background session，提供快速概览

两者不冲突——用户可以从对话流中找到具体 signal 点击查看详情，也可以从输入框旁的指示器快速了解是否有后台任务在运行。

## 实现范围

- 注册 `spawn.session` signal type（fyllo-signal registry）
- 行内渲染组件（signal UI）
- Slideover 三区域 UI（Prompt / Activity / Transcript）
- 全局 background 任务进度指示器
- Spawn session 状态表（renderer 侧，从 `spawn:*` 事件维护）
- prompt contract 更新：在 tool description 中告知 agent 输出 fyllo-signal

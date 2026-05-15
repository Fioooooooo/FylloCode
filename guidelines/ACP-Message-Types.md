# ACP 消息类型参考

本文档汇总 ACP 协议中 `session/update` notification 的所有消息类型，供实现消息持久化、UI 渲染等功能时参考。

## 概述

Agent 通过 `session/update` notification 向 Client 推送实时更新，用 `sessionUpdate` 字段作为类型判别符。

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "<type>",
      ...
    }
  }
}
```

## SessionUpdate 类型

### 1. `user_message_chunk`

用户消息的流式分块，agent 回显用户输入时使用。

```json
{
  "sessionUpdate": "user_message_chunk",
  "content": { "type": "text", "text": "帮我分析这段代码" }
}
```

| 字段      | 类型           | 说明       |
| --------- | -------------- | ---------- |
| `content` | `ContentBlock` | 单个内容块 |

---

### 2. `agent_message_chunk`

Agent 文本回复的流式分块，需拼合成完整消息。

```json
{
  "sessionUpdate": "agent_message_chunk",
  "content": { "type": "text", "text": "我来分析一下..." }
}
```

| 字段      | 类型           | 说明               |
| --------- | -------------- | ------------------ |
| `content` | `ContentBlock` | 通常为 `text` 类型 |

---

### 3. `agent_thought_chunk`

Agent 内部思考过程（reasoning）的流式分块。

```json
{
  "sessionUpdate": "agent_thought_chunk",
  "content": { "type": "text", "text": "需要先检查文件结构..." }
}
```

| 字段      | 类型           | 说明     |
| --------- | -------------- | -------- |
| `content` | `ContentBlock` | 思考内容 |

---

### 4. `tool_call`

新 tool call 发起时推送，描述本次调用的元信息。

```json
{
  "sessionUpdate": "tool_call",
  "toolCallId": "call_001",
  "title": "Reading configuration file",
  "kind": "read",
  "status": "pending"
}
```

| 字段         | 类型                 | 必填 | 说明              |
| ------------ | -------------------- | ---- | ----------------- |
| `toolCallId` | `string`             | ✓    | session 内唯一 ID |
| `title`      | `string`             | ✓    | 人类可读描述      |
| `kind`       | `ToolKind`           |      | 工具类别，见下表  |
| `status`     | `ToolCallStatus`     |      | 默认 `pending`    |
| `content`    | `ToolCallContent[]`  |      | 产出内容          |
| `locations`  | `ToolCallLocation[]` |      | 涉及的文件位置    |
| `rawInput`   | `object`             |      | 原始输入参数      |

**ToolKind 枚举：**

| 值        | 含义             |
| --------- | ---------------- |
| `read`    | 读取文件或数据   |
| `edit`    | 修改文件或内容   |
| `delete`  | 删除文件或数据   |
| `move`    | 移动或重命名文件 |
| `search`  | 搜索信息         |
| `execute` | 执行命令或代码   |
| `think`   | 内部推理或规划   |
| `fetch`   | 获取外部数据     |
| `other`   | 其他（默认）     |

---

### 5. `tool_call_update`

tool call 执行过程中的进度和结果更新，只需包含变化的字段。

```json
{
  "sessionUpdate": "tool_call_update",
  "toolCallId": "call_001",
  "status": "completed",
  "content": [
    {
      "type": "content",
      "content": { "type": "text", "text": "Found 3 configuration files..." }
    }
  ]
}
```

| 字段         | 类型                 | 必填 | 说明                  |
| ------------ | -------------------- | ---- | --------------------- |
| `toolCallId` | `string`             | ✓    | 关联的 `tool_call` ID |
| `status`     | `ToolCallStatus`     |      | 见下表                |
| `content`    | `ToolCallContent[]`  |      | 产出内容（增量）      |
| `title`      | `string \| null`     |      | 更新标题              |
| `kind`       | `ToolKind`           |      | 更新类别              |
| `locations`  | `ToolCallLocation[]` |      | 更新文件位置          |
| `rawInput`   | `object`             |      | 更新原始输入          |
| `rawOutput`  | `object`             |      | 原始输出              |

**ToolCallStatus 枚举：**

| 值            | 含义                             |
| ------------- | -------------------------------- |
| `pending`     | 等待开始（输入流式中或等待授权） |
| `in_progress` | 执行中                           |
| `completed`   | 成功完成                         |
| `failed`      | 执行失败                         |

---

### 6. `plan`

Agent 的执行计划。每次推送都是**完整替换**，Client 必须用新数据完全覆盖旧计划。

```json
{
  "sessionUpdate": "plan",
  "entries": [
    { "content": "检查现有代码结构", "priority": "high", "status": "completed" },
    { "content": "识别需要重构的组件", "priority": "high", "status": "in_progress" },
    { "content": "编写单元测试", "priority": "medium", "status": "pending" }
  ]
}
```

| 字段      | 类型          | 说明             |
| --------- | ------------- | ---------------- |
| `entries` | `PlanEntry[]` | 完整计划条目列表 |

**PlanEntry 结构：**

| 字段       | 类型                                        | 说明         |
| ---------- | ------------------------------------------- | ------------ |
| `content`  | `string`                                    | 计划条目描述 |
| `priority` | `"high" \| "medium" \| "low"`               | 优先级       |
| `status`   | `"pending" \| "in_progress" \| "completed"` | 当前状态     |

---

## ContentBlock 类型

ContentBlock 出现在 `agent_message_chunk`、`user_message_chunk`、`agent_thought_chunk` 以及 tool call 的 content 字段中。ACP 复用了 MCP 的 ContentBlock 结构。

| 类型            | 结构                                                | 说明                   |
| --------------- | --------------------------------------------------- | ---------------------- |
| `text`          | `{ type: "text", text: string }`                    | 纯文本                 |
| `image`         | `{ type: "image", mimeType: string, data: string }` | base64 编码图片        |
| `audio`         | `{ type: "audio", mimeType: string, data: string }` | base64 编码音频        |
| `resource`      | `{ type: "resource", ... }`                         | 嵌入资源（含文件内容） |
| `resource_link` | `{ type: "resource_link", ... }`                    | 资源链接（不含内容）   |

---

## 持久化分类

| 类型                             | 是否持久化 | 说明                        |
| -------------------------------- | ---------- | --------------------------- |
| `user_message_chunk`             | ✓          | 拼合成完整用户消息后存储    |
| `agent_message_chunk`            | ✓          | 拼合成完整 agent 回复后存储 |
| `agent_thought_chunk`            | 可选       | 思考过程，按需存储          |
| `tool_call` + `tool_call_update` | ✓          | 合并成一条 tool 记录后存储  |
| `plan`                           | ✗          | 运行时状态，重启后无意义    |

## Session ID 机制

- `sessionId` 由 **agent 生成**，client 无法指定
- 通过 `session/new` 请求，agent 在响应中返回 `sessionId`
- client 用此 ID 发送后续的 `session/prompt`、`session/cancel` 等请求

## 恢复 Session 的两种方式

| 方法             | 场景                       | 行为                                                                                                  |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `session/load`   | agent 进程重启后恢复       | agent 通过 `session/update` 流式重放历史消息给 client，需要 agent 声明 `loadSession: true` capability |
| `session/resume` | 连接断开后重连（进程仍在） | 直接续上，不重放历史，是更底层的原语                                                                  |

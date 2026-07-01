## MODIFIED Requirements

### Requirement: ACP sessionUpdate 映射为 SessionEvent

系统 SHALL 将 ACP `session/update` notification 映射为 `SessionEvent` 联合类型，通过 MessagePort 推送给渲染进程。

ACP 的 tool call 是独立的一等公民事件（不依附于某条 assistant message），因此不使用旧的 `message_upsert`/`message_patch` 模式，改为直接映射 ACP tool call 语义的新事件类型。

ACP `agent_thought_chunk` 与 `agent_message_chunk` 语义对称（同为 `ContentChunk`），区别仅在前者代表 agent 的思考过程（reasoning），后者代表用户可见输出（text）；两者分别映射到独立的 `SessionEvent` 成员。

ACP `available_commands_update` 是 session 级 slash 命令声明（`{ availableCommands: AvailableCommand[] }`），与单条消息流动无关，映射为独立 `SessionEvent` 成员，不进入 `MessageAssembler` 的消息组装通路。

ACP `plan` 是 session 级 Agent 行动清单广播（`{ entries: AgendaEntry[] }`），每次推送都是完整条目列表的全量替换（ACP 协议规定 agent MUST 发送完整列表、client MUST 整体替换）。FylloCode SHALL 只在 ACP 协议边界保留 `sessionUpdate === "plan"` 字面值；进入 FylloCode 内部事件、共享类型、IPC chunk、renderer store 和 UI 后 SHALL 使用 Agenda / 行动清单命名。该数据与单条消息流动无关，映射为独立 `SessionEvent` 成员，不进入 `MessageAssembler` 的消息组装通路，也不持久化。

**`SessionEvent` 联合类型定义（复用共享 `StreamContentEvent` 子集）：**

`SessionEvent` SHALL 由共享的 `StreamContentEvent`（定义于 `src/shared/types/stream-event.ts`）与主进程独有的控制流变体组合而成。判别字段统一为 `kind`（取代旧的 `type`）；工具类别字段统一为 `toolKind`（取代 `tool_call_start` 旧的 `kind`，消除与外层判别字段的语义重载）。

```typescript
// src/shared/types/stream-event.ts —— 主进程与渲染进程共用的跨进程同构子集
type ToolCallDiff = {
  path: string;
  newText: string;
  oldText?: string; // undefined = 新建文件（对应 ACP 文档 "null for new files"）
};

type ToolCallLocation = {
  path: string;
  line?: number;
};

type StreamContentEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "reasoning_delta"; text: string }
  | {
      kind: "tool_call_start";
      toolCallId: string;
      title: string;
      toolKind: string;
      input?: Record<string, unknown>;
      diff?: ToolCallDiff[];
      locations?: ToolCallLocation[];
      parentToolCallId?: string;
    }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
      diff?: ToolCallDiff[];
      locations?: ToolCallLocation[];
      title?: string;
      toolKind?: string;
    }
  | {
      kind: "usage_update";
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | { kind: "session_info_update"; title: string }
  | { kind: "available_commands_update"; commands: AcpAvailableCommand[] }
  | { kind: "agenda_update"; entries: AgendaEntry[] }
  | { kind: "config_options_update"; options: AcpSessionConfigOption[] };

// src/main/domain/chat/session-events.ts
type SessionEvent =
  | StreamContentEvent
  | { kind: "done"; totalTokens: number }
  | { kind: "error"; code: string; message: string }
  | { kind: "session_id_resolved"; acpSessionId: string };
```

`acp-mapper` SHALL 保持为无状态纯函数，不跨事件追踪 toolCallId 状态。

`acp-mapper` 对 `tool_call` 与 `tool_call_update` SHALL 使用同一套字段位置无关的提取逻辑：无论 `input`（来自 `rawInput`）、`content`（text 类型 ContentBlock 拼合）、`diff`（`content[]` 中 `type === "diff"` 的项）出现在 start 事件还是 update 事件，都按相同规则提取。

#### Scenario: 文本流式输出

- **WHEN** ACP 推送 `sessionUpdate === "agent_message_chunk"` 且 `content.type === "text"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "text_delta", text } }`

#### Scenario: 思考片段流式输出

- **WHEN** ACP 推送 `sessionUpdate === "agent_thought_chunk"` 且 `content.type === "text"`
- **THEN** `acp-mapper` 产出 `SessionEvent { kind: "reasoning_delta", text }`

#### Scenario: 思考片段非文本内容忽略

- **WHEN** ACP 推送 `sessionUpdate === "agent_thought_chunk"` 且 `content.type !== "text"`
- **THEN** `acp-mapper` 返回 `null`，不产生任何下游 chunk

#### Scenario: 工具调用开始（任意起始 status）

- **WHEN** ACP 推送 `sessionUpdate === "tool_call"`（`status` 为 `pending`、`in_progress` 或缺失）
- **THEN** `acp-mapper` 产出 `SessionEvent { kind: "tool_call_start", toolCallId, title, toolKind }`
- **AND** 若该 `tool_call` 已携带 `rawInput`，提取为 `input`
- **AND** 若该 `tool_call` 的 `content[]` 含 `type === "diff"` 项，提取为 `diff`
- **AND** title 优先取 `_meta.claudeCode.toolName`，否则按 `normalizeMcpTool(update.rawInput, update.title)` 归一 MCP 工具名，最后回退原 `update.title`

#### Scenario: 工具调用进度或完成

- **WHEN** ACP 推送 `sessionUpdate === "tool_call_update"`，`status` 为 `"in_progress"`、`"completed"` 或 `"failed"`
- **THEN** 产出 `SessionEvent { kind: "tool_call_update", toolCallId, status, input?, content?, diff? }`
- **AND** `content` 为 `content[]` 中所有 text 类型 ContentBlock 的拼合文本（无则 `undefined`）
- **AND** 若 `content[]` 含 `type === "diff"` 项，提取为 `diff`
- **AND** 事件同时携带 `title`/`toolKind`（若 update 自带），供下游孤儿补偿建卡使用

#### Scenario: gemini 跳过 tool_call start（孤儿 update）

- **WHEN** ACP 推送 `sessionUpdate === "tool_call_update"`，但此前从未推送过同 `toolCallId` 的 `tool_call` 事件（如 gemini 的 `list_directory`、`replace`、MCP 工具）
- **THEN** `acp-mapper` 仍按常规产出 `tool_call_update` 事件（无状态，不感知缺失的 start）
- **AND** 下游 assembler 负责惰性建卡（见「前端 chat store」与「Main 进程组装」两个 requirement）

#### Scenario: qodercli completed-but-error 降级（agent 怪癖补丁）

- **WHEN** ACP 推送 `sessionUpdate === "tool_call_update"`，`status === "completed"` 且 `rawOutput.error` 为非空字符串
- **THEN** `acp-mapper` 将 status 降级为 `"failed"`，并将 `content` 取为该 error 文本
- **AND** 其他情形（无 `rawOutput.error` 或非字符串）保持原 status 透传

#### Scenario: usage_update 实时推送

- **WHEN** ACP 推送 `sessionUpdate === "usage_update"`
- **THEN** 产出 `SessionEvent { kind: "usage_update", used, size, cost }`，原始值直接透传

#### Scenario: session_info_update 推送

- **WHEN** ACP 推送 `sessionUpdate === "session_info_update"` 且 `title` 为非空字符串
- **THEN** `acp-mapper` 产出 `SessionEvent { kind: "session_info_update", title }`

#### Scenario: 可用命令列表推送

- **WHEN** ACP 推送 `sessionUpdate === "available_commands_update"`，携带 `availableCommands` 数组
- **THEN** `acp-mapper` 对每条命令仅取 `name`、`description` 及 `input.hint`（当 `input != null && input.hint` 为字符串），丢弃 `_meta` 与未识别字段
- **AND** 产出 `SessionEvent { kind: "available_commands_update", commands }`
- **AND** 即使为空数组仍产出事件

#### Scenario: 行动清单推送

- **WHEN** ACP 推送 `sessionUpdate === "plan"`，携带 `entries` 数组
- **THEN** `acp-mapper` 对每条仅取 `content`、`priority`、`status`，丢弃 `_meta` 与未识别字段
- **AND** 未识别 priority SHALL 归一为 `"medium"`，未识别 status SHALL 归一为 `"pending"`
- **AND** 产出 `SessionEvent { kind: "agenda_update", entries }`
- **AND** 即使为空数组仍产出事件

#### Scenario: prompt 完成

- **WHEN** `connection.prompt` 返回（`stopReason` 为 `"end_turn"` 或其他终止原因）
- **THEN** 通过 MessagePort 发送 `{ type: "done", data: { totalTokens } }` 并关闭 port1

#### Scenario: ACP 通信异常

- **WHEN** `connection.prompt` 抛出异常或 ACP 进程不可用
- **THEN** 通过 MessagePort 发送 `{ type: "error", data: { code: "ACP_ERROR", message } }` 并关闭 port1

#### Scenario: 未识别 sessionUpdate 类型

- **WHEN** ACP 推送其他未识别的 `sessionUpdate` 类型
- **THEN** `acp-mapper` 在 default 分支记录 debug 日志，返回 `null`，不产生任何下游 chunk

### Requirement: 前端 chat store 从流式事件组装 assistant UIMessage

前端 chat store SHALL 在流式过程中实时组装 `role: "assistant"` 的 `UIMessage`，不等待 prompt 完成。ACP 没有“assistant message”的概念，text chunk、reasoning chunk 和 tool call 均为独立事件，store 通过 `useUIMessageAssembler` 将它们归并到同一条 assistant message 的 `parts` 数组中。

**组装规则：**

- 收到第一个 `text_delta` 时，若当前无活跃 assistant message，则创建一条新的 `UIMessage`（生成临时 id），追加到 `session.messages`，并记录为 `activeAssistantId`
- 后续 `text_delta` 追加到 `activeAssistantId` 对应消息的 text part；若当前 part 不是 text part（如刚结束一段 reasoning 或 tool），新建 text part 并更新 `activeTextPartIdx`
- 收到 `reasoning_delta` 时，与 text 轨道对称处理：维护独立的 `activeReasoningPartIdx`，连续 reasoning delta 合并到同一 `{ type: "reasoning", text }` part；任意 `reasoning_delta` 到达时重置 `activeTextPartIdx`（反向亦然）
- 收到 `tool_call_start` 时，向 `activeAssistantId` 对应消息追加一个 `dynamic-tool` part（`state: "input-available"`，携带 `toolCallId`、`toolName: title`、`input: input ?? {}`）；若当前无活跃 assistant message，先创建一条；同时重置 `activeTextPartIdx` 与 `activeReasoningPartIdx`
- 收到 `tool_call_update`（completed/failed）时，找到对应 `toolCallId` 的 `dynamic-tool` part，更新 `state` 为 `"output-available"`，写入 `output: content`
- 收到 `usage_update` 时，更新 `activeSession.tokenUsage`
- 收到 `available_commands_update` 时，**不触碰消息容器**，调用 `useSessionStore().setSessionAvailableCommands(activeSession.id, commands)`
- 收到 `agenda_update` 时，**不触碰消息容器**，调用 `useSessionStore().setSessionAgentAgenda(activeSession.id, entries)`
- 收到 `done` 时，清空 `activeAssistantId`、`activeTextPartIdx`、`activeReasoningPartIdx`

**`MessageChunkData` 类型（复用共享 `StreamContentEvent` 子集）：**

`MessageChunkData` SHALL 定义为 `StreamContentEvent | { kind: "user_message"; message } | { kind: "status"; agentStatus }`，详见 `ipc-streaming` 能力的对应 delta。判别字段为 `kind`，工具类别字段为 `toolKind`。

#### Scenario: 纯文本回复的流式渲染

- **WHEN** 流式过程中连续收到多个 `text_delta`
- **THEN** store 创建一条 assistant UIMessage，每个 delta 追加到其 text part，UI 实时更新

#### Scenario: 纯 reasoning 回复的流式渲染

- **WHEN** 流式过程中连续收到多个 `reasoning_delta`
- **THEN** store 创建一条 assistant UIMessage，每个 delta 追加到同一 `{ type: "reasoning", text }` part

#### Scenario: reasoning 与 text 交替

- **WHEN** 同一轮回复中 `reasoning_delta` 与 `text_delta` 交替到达
- **THEN** 所有内容归并到同一条 assistant UIMessage 的 `parts` 数组；各自独立延续，互相重置活跃 idx，不跨类型合并

#### Scenario: 含工具调用的回复

- **WHEN** 流式过程中收到 `tool_call_start`，随后收到 `tool_call_update`（completed）
- **THEN** store 向当前 assistant message 追加 `dynamic-tool` part，初始 `state: "input-available"`
- **AND** 收到 completed 后更新该 part 的 `state` 为 `"output-available"`，写入 `output`
- **AND** `tool_call_start` 触发时同时重置 text 与 reasoning 的 active idx

#### Scenario: 孤儿 tool_call_update 惰性建卡（gemini 兼容）

- **WHEN** 流式过程中收到 `tool_call_update`，但 `activeAssistantId` 对应消息的 `parts` 中不存在该 `toolCallId` 的 `dynamic-tool` part
- **THEN** `useUIMessageAssembler` SHALL 用该 update 自带的 `toolCallId`、`title`、`toolKind` 惰性创建一个 `dynamic-tool` part（`state: "input-available"`），而非丢弃该 update
- **AND** 若当前无活跃 assistant message，先创建一条
- **AND** 随后对新建 part 应用该 update（completed/failed → `output-available`）

#### Scenario: 文本与工具调用交替出现

- **WHEN** 同一轮回复中 `text_delta` 和 `tool_call_start` 交替到达
- **THEN** 所有内容归并到同一条 assistant UIMessage 的 `parts` 数组，顺序与到达顺序一致

#### Scenario: 流式过程中实时更新 token 用量

- **WHEN** 前端收到 `usage_update` chunk，携带 `used` 和 `size`
- **THEN** chat store 更新 `activeSession.tokenUsage` 的 `used`/`size`/`cost`，UI 环形进度条实时反映

#### Scenario: 流式收到 available_commands_update

- **WHEN** 前端 chat store 在 `streamSessionMessage.onChunk` 中收到 `{ kind: "available_commands_update", commands }`
- **THEN** 不经过 `useUIMessageAssembler`，调用 `useSessionStore().setSessionAvailableCommands(activeSession.id, commands)`；空数组也原样覆盖

#### Scenario: 流式收到 agenda_update

- **WHEN** 前端 chat store 在 `streamSessionMessage.onChunk` 中收到 `{ kind: "agenda_update", entries }`
- **THEN** 不经过 `useUIMessageAssembler`，调用 `useSessionStore().setSessionAgentAgenda(activeSession.id, entries)`；空数组也原样覆盖

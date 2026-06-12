## ADDED Requirements

### Requirement: MessageChunkData 与 SessionEvent 复用共享 StreamContentEvent 子集

系统 SHALL 在 `src/shared/types/stream-event.ts` 定义跨进程同构的流式内容子集 `StreamContentEvent`，作为主进程 `SessionEvent` 与跨进程 `MessageChunkData` 的公共基底，消除两者之间逐字段重复定义与逐字段抄写式转换。

`StreamContentEvent` SHALL 包含以下 9 个判别成员（判别字段为 `kind`，工具类别字段为 `toolKind`）：`text_delta`、`reasoning_delta`、`tool_call_start`、`tool_call_update`、`usage_update`、`session_info_update`、`available_commands_update`、`plan_update`、`config_options_update`。其字段定义见 `acp-chat-backend` 能力中 `StreamContentEvent` 的 TypeScript 定义（含 tool_call 的 `input?`/`diff?`/`locations?`/`parentToolCallId?` 等可选字段）。

`MessageChunkData` SHALL 定义为：

```typescript
type MessageChunkData =
  | StreamContentEvent
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "status"; agentStatus: ChatStatus };
```

`SessionEvent` SHALL 定义为 `StreamContentEvent` 与主进程控制流变体（`done` / `error` / `session_id_resolved`）的并集，详见 `acp-chat-backend` 能力。

`session-event-mapper.toMessageChunk` SHALL 对属于 `StreamContentEvent` 子集的事件直接结构化透传（含一次跨 MessagePort 所需的深拷贝），仅对主进程独有的 `done` / `error` / `session_id_resolved` 返回 `null`；SHALL NOT 再对 9 个同构成员逐字段抄写重建。

`user_message` 与 `status` 分支 SHALL 仅存在于 `MessageChunkData`（渲染态），SHALL NOT 出现在 `SessionEvent`；`done` / `error` / `session_id_resolved` SHALL 仅存在于 `SessionEvent`（控制流），SHALL NOT 出现在 `MessageChunkData`。

所有消费 `MessageChunkData` 与 `SessionEvent` 的 switch SHALL 依赖 TypeScript 穷尽检查（`never` 兜底）在编译期发现因判别字段由 `type` 改名为 `kind`、工具类别字段由 `kind` 改名为 `toolKind` 而遗漏的分支。

#### Scenario: 同构成员直接透传

- **WHEN** `toMessageChunk` 收到 `SessionEvent`，其 `kind` 属于 `StreamContentEvent` 9 个成员之一（如 `tool_call_start`）
- **THEN** 返回结构等价的 `MessageChunkData`（同 `kind` 与字段），无需逐字段重新构造
- **AND** 携带的可选字段（如 `input`、`diff`、`toolKind`）一并透传

#### Scenario: 主进程控制流事件不进入 chunk

- **WHEN** `toMessageChunk` 收到 `kind` 为 `done`、`error` 或 `session_id_resolved` 的 `SessionEvent`
- **THEN** 返回 `null`，不产生 `MessageChunkData`

#### Scenario: 渲染态分支不出现在 SessionEvent

- **WHEN** 审查 `src/main/domain/chat/session-events.ts` 的 `SessionEvent` 定义
- **THEN** 不包含 `user_message` 或 `status` 成员

#### Scenario: 判别字段改名的穷尽检查

- **WHEN** 任一消费 `SessionEvent` 的 switch（如 `chat.ts`、`acp-session-recovery.ts`、`message-assembler.ts`）在改名后遗漏某个 `kind` 分支
- **THEN** `pnpm typecheck` 在 `never` 兜底处报错，编译期暴露遗漏

### Requirement: tool_call chunk 携带字段位置无关提取的可选字段

`MessageChunkData` 的 `tool_call_start` 与 `tool_call_update` 分支 SHALL 通过共享 `StreamContentEvent` 携带可选的 `input?: Record<string, unknown>`、`diff?: ToolCallDiff[]`、`locations?: ToolCallLocation[]` 字段，以承载 acp-mapper 字段位置无关提取的结果（无论字段来自 ACP `tool_call` 还是 `tool_call_update`）。`tool_call_update` 额外携带可选 `title?`、`toolKind?` 供下游孤儿建卡使用。

`ToolCallDiff` 与 `ToolCallLocation` 类型 SHALL 由 `src/shared/types/stream-event.ts` 导出，不依赖 `@agentclientprotocol/sdk` 导入到 shared / preload / renderer。本期消费方对 `locations` / `parentToolCallId` 仅透传、不强制渲染。

#### Scenario: tool_call_start 携带 start 期 diff

- **WHEN** main 收到 codex edit 类工具的 `tool_call`（start 时 `content[]` 已含 `type === "diff"` 项），经 acp-mapper 提取为 `diff`
- **THEN** 通过 port1 发送 `{ kind: "tool_call_start", toolCallId, title, toolKind, diff: [<diff 项>] }`
- **AND** preload 触发 `onChunk`，`diff` 字段保留

#### Scenario: tool_call_update 携带提取的 diff

- **WHEN** main 收到 gemini/opencode edit 类工具的 `tool_call_update`（`content[]` 含 `type === "diff"` 项）
- **THEN** 通过 port1 发送的 chunk 携带 `diff` 字段

#### Scenario: 孤儿 update 携带建卡所需字段

- **WHEN** main 收到无前置 start 的 `tool_call_update`（gemini）
- **THEN** chunk 携带 `title` 与 `toolKind`（若 update 自带），使渲染进程 assembler 能据此惰性建卡

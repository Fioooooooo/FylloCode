## MODIFIED Requirements

### Requirement: MessageChunkData 包含 plan_update 分支

`MessageChunkData` 联合类型 SHALL 包含 `agenda_update` 分支，用于流式协议在 turn 进行中传递 ACP Agent 行动清单的全量替换。该分支结构 SHALL 为：

```typescript
{ kind: "agenda_update"; entries: AgendaEntry[] }
```

`AgendaEntry` 类型由 `src/shared/types/chat.ts` 导出（脱 SDK 类型，不依赖 `@agentclientprotocol/sdk` 导入到 shared / preload / renderer），字段为 `content: string`、`priority: "high" | "medium" | "low"`、`status: "pending" | "in_progress" | "completed"`。

`session-event-mapper.toMessageChunk` SHALL 处理 `SessionEvent { kind: "agenda_update", entries }`，返回 `{ kind: "agenda_update", entries }`，让 `chat:stream:message` handler 可以通过 `sink.sendChunk` 透传给 renderer。

所有消费 `MessageChunkData` 的 switch/分支 SHALL 处理 `agenda_update` 分支；TypeScript 穷尽检查 SHALL 在编译期发现漏处理。`useUIMessageAssembler.applyChunk` 与现有 `available_commands_update`/`config_options_update` 一样将 `agenda_update` 归入“忽略（不组装进 message parts）”的分支。

#### Scenario: 接收 agenda_update chunk

- **WHEN** main 进程从 `AcpSession` 收到 `agenda_update` 事件，`entries` 含 3 项
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "agenda_update", entries: [<3 项>] } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "agenda_update", entries })` 回调

#### Scenario: 空数组的 agenda_update 仍透传

- **WHEN** `AcpSession` emit `agenda_update` 且 `entries.length === 0`
- **THEN** main 仍通过 port1 发送对应 chunk
- **AND** preload 仍触发 `onChunk`

#### Scenario: proposal 流不发送 agenda_update

- **WHEN** `proposal:stageStream` 或 `proposal:archive` handler 从其 `AcpSession` 收到 `agenda_update`
- **THEN** handler 显式忽略，不调用 `sink.sendChunk`
- **AND** renderer 不会从 proposal 流收到 `agenda_update` chunk

#### Scenario: assembler 忽略 agenda_update

- **WHEN** `useUIMessageAssembler.applyChunk` 收到 `{ kind: "agenda_update", entries }`
- **THEN** 不修改 `messages`，不创建或更新任何 message part
- **AND** TypeScript 穷尽检查通过（`agenda_update` 被显式纳入忽略分支）

### Requirement: MessageChunkData 与 SessionEvent 复用共享 StreamContentEvent 子集

系统 SHALL 在 `src/shared/types/stream-event.ts` 定义跨进程同构的流式内容子集 `StreamContentEvent`，作为主进程 `SessionEvent` 与跨进程 `MessageChunkData` 的公共基底，消除两者之间逐字段重复定义与逐字段抄写式转换。

`StreamContentEvent` SHALL 包含以下 9 个判别成员（判别字段为 `kind`，工具类别字段为 `toolKind`）：`text_delta`、`reasoning_delta`、`tool_call_start`、`tool_call_update`、`usage_update`、`session_info_update`、`available_commands_update`、`agenda_update`、`config_options_update`。其字段定义见 `acp-chat-backend` 能力中 `StreamContentEvent` 的 TypeScript 定义（含 tool_call 的 `input?`/`diff?`/`locations?`/`parentToolCallId?` 等可选字段）。

`MessageChunkData` SHALL 定义为：

```typescript
type MessageChunkData =
  | StreamContentEvent
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "status"; agentStatus: ChatStatus };
```

`SessionEvent` SHALL 定义为 `StreamContentEvent` 与主进程控制流变体（`done` / `error` / `session_id_resolved`）的并集，详见 `acp-chat-backend` 能力。

#### Scenario: 共享事件子集单点定义

- **WHEN** 新增或修改跨进程同构内容事件字段
- **THEN** 字段 SHALL 优先定义在 `src/shared/types/stream-event.ts`
- **AND** `SessionEvent` 与 `MessageChunkData` SHALL 通过该共享子集获得一致类型
- **AND** `session-event-mapper.toMessageChunk` SHALL 对同构成员做结构化透传，不逐字段重建

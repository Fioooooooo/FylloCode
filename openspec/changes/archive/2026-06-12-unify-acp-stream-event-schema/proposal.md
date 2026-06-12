## Why

当前 ACP 流式链路存在两个相互独立但根因相同的问题：

1. **两层冗余类型转换**：主进程内部用 `SessionEvent`（`src/main/domain/chat/session-events.ts`）表达 ACP 语义事件，跨进程又用 `MessageChunkData`（`src/shared/types/ipc.ts`）表达 UI chunk。两者 14 个变体中有 9 个完全同构，仅 `type`↔`kind`、`kind`↔`toolKind` 字段名不同。`session-event-mapper.ts` 的 `toMessageChunk` 因此沦为逐字段抄写，每加一个流式字段都要在两处同步定义、在转换层再抄一遍，易漏易错。

2. **工具调用兼容缺口**：`acp-mapper.ts` 把"从哪个事件读哪个字段"写死——`tool_call` 分支只读 `title`/`kind`，`tool_call_update` 分支只读 `status`/`content`/`rawInput`。但 ACP 协议规定除 `toolCallId`/`title` 外所有字段可选、且**不规定字段出现时机**（见 `references/acp/tool-call-trace/ACP-Tool-Call-Document.md`）。导致 gemini 跳过 `tool_call` start 时工具卡片无法创建、codex/qodercli 在 start 时已携带的 `rawInput`/`diff` 被丢弃。

两个问题都源于"字段提取位置写死 + 类型契约分裂"。本期一并解决，避免先重构再补兼容时二次改动同一批契约文件。

## What Changes

- **抽取共享流式事件子集**：新建 `src/shared/types/stream-event.ts`，定义跨进程同构的 `StreamContentEvent` 联合类型（统一以 `kind` 作判别字段、`toolKind` 表达工具类别）。`SessionEvent` 与 `MessageChunkData` 各自 `= StreamContentEvent | <自己独有的变体>`：
  - `SessionEvent` 外挂主进程控制流变体：`done` / `error` / `session_id_resolved`
  - `MessageChunkData` 外挂渲染态变体：`user_message` / `status`
- **BREAKING（内部契约）**：`SessionEvent` 的判别字段由 `type` 改为 `kind`，`tool_call_start.kind` 字段更名为 `toolKind`。牵动 `acp-mapper.ts`、`message-assembler.ts`、`acp-session-recovery.ts`、`acp-session.ts`、`chat.ts` 的 switch；此为纯机械改名，无运行时行为变化。该契约仅存在于本仓库主/渲染进程之间，不涉及外部 API。
- **瘦身转换层**：`toMessageChunk` 对 `StreamContentEvent` 子集直接透传（含一次跨 MessagePort 的深拷贝），仅对 `done`/`error`/`session_id_resolved` 返回 `null`。
- **工具调用字段位置无关提取（原则）**：`tool_call` 与 `tool_call_update` 共用一套字段提取逻辑——`input`（来自 `rawInput`）、`content`（text 块拼合）、`diff`（`content[].type === "diff"` 提取）无论出现在 start 还是 update 都被读取。`tool_call_start` 与 `tool_call_update` 共享可选字段 `input` / `diff`。
- **gemini 孤儿 update 兼容**：`tool_call_update` 到达时若对应 part 不存在，由两个 assembler（`message-assembler.ts` 与 `useUIMessageAssembler.ts`）惰性创建（lazy-upsert），mapper 保持无状态。
- **qodercli 错误态纠偏（补丁）**：`tool_call_update` 中 `status === "completed"` 但 `rawOutput.error` 为非空字符串时，降级为 `failed` 并取 error 文本为 content。明确标注为"已知 agent 怪癖补丁"。
- **MCP 工具标识归一（补丁）**：基于 `rawInput` 结构（`{ server, tool, arguments }`）而非 title 字符串解析来识别 MCP 工具，归一为统一展示格式。明确标注为补丁，且修正现有差异矩阵中 gemini title 等事实错误。
- **预留 ACP 扩展字段**：统一 schema 为 `locations`、`terminal` 等当前丢弃的 ACP content 类型预留可选字段位（本期仅透传，不强制消费），降低未来兼容新 agent 时再改契约的概率。

## Capabilities

### New Capabilities

（无新增能力，均为既有能力的契约修改。）

### Modified Capabilities

- `acp-chat-backend`: 「ACP sessionUpdate 映射为 SessionEvent」requirement 的 `SessionEvent` 定义改为复用共享 `StreamContentEvent`（判别字段 `kind`、工具类别 `toolKind`），并新增 tool_call 字段位置无关提取、孤儿 update 处理、completed+error 降级、MCP 标识归一、`input`/`diff` 字段透传等映射行为。「前端 chat store 从流式事件组装 assistant UIMessage」requirement 新增孤儿 update 惰性创建语义。
- `ipc-streaming`: `MessageChunkData` 类型定义改为 `= StreamContentEvent | user_message | status`，其 `tool_call_start`/`tool_call_update` 分支字段随共享子集变更（新增 `toolKind`、`diff` 等）。

## Impact

- **共享类型**：新增 `src/shared/types/stream-event.ts`；修改 `src/shared/types/ipc.ts`。
- **主进程**：`src/main/domain/chat/session-events.ts`、`src/main/services/chat/acp-mapper.ts`、`src/main/services/chat/session-event-mapper.ts`、`src/main/domain/chat/message-assembler.ts`、`src/main/domain/chat/acp-session-recovery.ts`、`src/main/services/chat/acp-session.ts`、`src/main/ipc/chat.ts`。
- **渲染进程**：`src/renderer/src/composables/useUIMessageAssembler.ts`、`src/renderer/src/stores/chat.ts`。
- **测试**：上述模块对应的 `test/` 镜像测试；新增 acp-mapper 多 agent 兼容测试。
- **依赖**：无新增第三方依赖。
- **运行时行为**：类型统一部分为零行为变化的机械重构；兼容部分会改变 gemini/codex/qodercli 三类 agent 的工具卡片展示结果。

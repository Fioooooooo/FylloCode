## 1. 共享流式事件子集（类型统一基础）

- [x] 1.1 新建 `src/shared/types/stream-event.ts`
- [x] 1.2 修改 `src/shared/types/ipc.ts`：将 `MessageChunkData` 改为 `StreamContentEvent | { kind: "user_message"; message } | { kind: "status"; agentStatus }`

## 2. SessionEvent 复用子集 + 判别字段改名（零行为变化重构）

- [x] 2.1 修改 `src/main/domain/chat/session-events.ts`：将 `SessionEvent` 改为 `StreamContentEvent | { kind: "done"; totalTokens } | { kind: "error"; code; message } | { kind: "session_id_resolved"; acpSessionId }`，删除 9 个同构成员内联定义。判别字段由 `type` 统一为 `kind`。
- [x] 2.2 修改 `src/main/services/chat/acp-mapper.ts`：所有 `SessionEvent` 产出处 `type:` 改 `kind:`；`tool_call_start` 的 `kind:` 字段改为 `toolKind:`。本步仅做机械改名，不引入新提取逻辑（提取逻辑在第 4 组）。
- [x] 2.3 修改 `src/main/services/chat/session-event-mapper.ts` 的 `toMessageChunk`：对属于 `StreamContentEvent` 子集的事件直接结构化透传（保留一次深拷贝用于跨 MessagePort），仅对 `done`/`error`/`session_id_resolved` 返回 `null`。删除对 9 个成员的逐字段重建。switch 改用 `ev.kind`。
- [x] 2.4 修改 `src/main/domain/chat/message-assembler.ts`：`apply(ev)` 内所有 `ev.type` 改 `ev.kind`；`tool_call_start` 读取 `ev.toolKind`。
- [x] 2.5 修改 `src/main/domain/chat/acp-session-recovery.ts`：`firstObservedEventType: SessionEvent["type"]` 改为 `SessionEvent["kind"]`；`shouldSuppressDuringReplay` 的 switch 由 `event.type` 改 `event.kind`，逐 case 标签同步。
- [x] 2.6 修改 `src/main/services/chat/acp-session.ts`：`firstObservedEventType = event.type` 等读取处改 `event.kind`。
- [x] 2.7 修改 `src/main/ipc/chat.ts`：`session.on("event")` 的大 switch 由 `ev.type` 改 `ev.kind`，所有 case 标签同步；确认 `done`/`error`/`session_id_resolved` 分支不变。
- [x] 2.8 修改 `src/renderer/src/composables/useUIMessageAssembler.ts` 与 `src/renderer/src/stores/chat.ts`：消费 `MessageChunkData` 处适配 `tool_call_start` 的 `toolKind` 字段（原读 `chunk.title` 建 part 不变；如有读工具类别处改 `toolKind`）。
- [x] 2.9 运行 `pnpm typecheck` 修复所有因改名产生的 `never` 穷尽检查报错，直至 Node + Web 全绿。验收：本组完成后运行既有 `test/` 全套 `pnpm test` 通过，证明零行为变化。

## 3. 转换层与既有测试对齐

- [x] 3.1 更新 `test/main/services/chat/session-event-mapper`（或对应镜像测试）：断言子集透传与控制流返回 `null`，字段名用 `kind`/`toolKind`。
- [x] 3.2 更新 `test/main/services/chat/acp-mapper`、`test/main/domain/chat/message-assembler`、`test/main/domain/chat/acp-session-recovery` 等镜像测试中的 `type`→`kind`、`kind`→`toolKind` 断言。
- [x] 3.3 更新 `test/renderer/.../useUIMessageAssembler` 测试断言字段名。验收：`pnpm test` 全绿。

## 4. 工具调用字段位置无关提取（原则，吸收原缺口 1/2/3）

- [x] 4.1 在 `src/main/services/chat/acp-mapper.ts` 新增共享辅助函数：`extractToolInput(rawInput): Record<string, unknown> | undefined`、`extractTextContent(content): string | undefined`、`extractDiffs(content): ToolCallDiff[] | undefined`、`extractLocations(locations): ToolCallLocation[] | undefined`。
- [x] 4.2 改造 `tool_call` 分支：除 `title`/`toolKind` 外，调用 4.1 函数从 `update.rawInput`/`update.content`/`update.locations` 提取 `input`/`diff`/`locations` 写入 `tool_call_start` 事件。title 仍优先 `_meta.claudeCode.toolName`。
- [x] 4.3 改造 `tool_call_update` 分支：复用同一组 4.1 函数提取 `input`/`content`/`diff`/`locations`，并将 update 自带的 `title`/`toolKind`（若有）写入事件，供孤儿建卡用。
- [x] 4.4 在 `src/main/domain/chat/message-assembler.ts` 的 `apply` 中，将 `tool_call_update` 分支 `idx === -1` 的 `return` 改为：用 `ev.toolCallId`/`ev.title`/`ev.toolKind` 惰性创建 `dynamic-tool` part（`state: "input-available"`，`input: ev.input ?? `）后继续应用更新。
- [x] 4.5 在 `src/renderer/src/composables/useUIMessageAssembler.ts` 的 `applyToolUpdate` 中，将 `idx === -1` 的 `return` 改为同样的惰性建卡逻辑（若无 `activeAssistantId` 先 `ensureAssistantMessage()`）。
- [x] 4.6 新增/扩充测试：以 `references/acp/tool-call-trace/agent-tool-call-analysis/` 的 gemini（孤儿 update、start 缺失）、codex（start 带 rawInput + diff）、qodercli（start 带 rawInput）trace 为夹具，断言两个 assembler 均能正确建卡并填充 input/diff。验收：`pnpm test` 全绿。

## 5. agent 怪癖补丁（明确隔离）

- [x] 5.1 在 `src/main/services/chat/acp-mapper.ts` 新增 `resolveStatus(status, rawOutput): "in_progress" | "completed" | "failed"`：当 `status === "completed"` 且 `rawOutput?.error` 为非空字符串时返回 `"failed"`。在 `tool_call_update` 分支应用，并在 error 降级时将 `content` 取为该 error 文本。函数上方注释标注"qodercli 怪癖补丁：违反 ACP failed 语义"。
- [x] 5.2 新增 `normalizeMcpTool(rawInput, title): { title: string } | undefined`：优先用 `rawInput` 结构 `{ server, tool, arguments }`（codex 形态）识别 MCP 工具并归一展示标识；识别失败回退原 `title`。函数上方注释标注"agent 怪癖补丁；非 codex 形态本期 fallback"。先修正 `references/acp/tool-call-trace/acp-mapper-refactor-plan.md` 差异矩阵中的事实错误（gemini MCP title 实为 `"guidelines (fyllo-cortex MCP Server)"`、qodercli 主 toolCallId 实为 `toolu_bdrk_*`、claude 为 `tooluse_*`），再据修正后的事实实现。
- [x] 5.3 新增测试：qodercli Grep `completed + rawOutput.error` trace 断言降级为 `failed`；codex MCP `{server,tool,arguments}` trace 断言 title 归一；非 codex 形态断言 fallback 原值。验收：`pnpm test` 全绿。

## 6. 校验与文档

- [x] 6.1 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 全套，确保全绿。
- [x] 6.2 评估并更新本地仓库 guidelines：在 `guidelines/IPC.md`（IPC 通信）补充"`SessionEvent` 与 `MessageChunkData` 共享 `StreamContentEvent` 子集、判别字段统一为 `kind`/`toolKind`、`toMessageChunk` 仅过滤控制流"的约定；在 `guidelines/Domain.md` 或 `guidelines/Architecture.md` 补充"acp-mapper 保持无状态、工具调用字段位置无关提取、agent 怪癖补丁需显式隔离标注"的约定。验收：guidelines 文件含上述条目。

## Why

chat 与 proposal apply/archive 两条流式链路目前各自实现一套"持久化 + UIMessage 组装 + 渲染"，职责划分不一致：chat 由渲染进程在 `onDone` 调 `persistMessage` IPC 落盘 assistant 消息，proposal apply 则在主进程用 `MessageAssembler` 落盘；两处渲染端又各自复制了一份 `ensureAssistantMessage` / `applyChunk` 逻辑，chat 侧用 `UChatMessages + UChatTool + ChatComark` 渲染，proposal SidePanel 写了一个简化 `v-for`。职责不统一导致后续再加任何新的流式场景都要两头改，且两套渲染在用户视觉上不一致。本次统一持久化边界、组装逻辑与消息列表渲染。

## What Changes

- **BREAKING**（内部 IPC 契约）：chat assistant 消息改为由主进程在 `done` 时通过 `MessageAssembler.flush()` + `appendMessage` 落盘，不再由渲染进程在 `onDone` 内调 `chat:persistMessage` 落盘 assistant。`chat:persistMessage` IPC 保留但语义收窄为"只用于 user message"。
- 新增 proposal stage 的 user message（stage prompt）持久化：主进程在 `proposal:stageStream` 启动时立即将 stage prompt 作为 `role: "user"` UIMessage 落盘到 `stage-{N}.messages.jsonl`，并通过新的 chunk kind `user_message` 推给渲染进程，保证 SidePanel 即时显示用户输入。
- **BREAKING**：新增 `MessageChunkData` 分支 `{ kind: "user_message"; message: UIMessage }`，更新 `shared/types/ipc.ts` 类型定义、`session-event-mapper` / preload 回调类型。
- proposal archive 流改为独立落盘：主进程在 `proposal:archive` 启动时创建 `apply-runs/<changeId>/archive.json`（`ArchiveRunMeta`），并将 archive 的 user prompt 与 assistant 输出写入 `apply-runs/<changeId>/archive.messages.jsonl`；archive 与 stage 语义解耦，不再挂在某个 stage 编号上。
- 新增 IPC：`proposal:loadArchive`、`proposal:loadArchiveMessages`，用于页面重开后的 archive 恢复。
- `resumeRun` / 新增 `resumeArchive`：主进程 `loadRunMessages` 返回 user + assistant 顺序混合的消息列表，渲染进程直接按磁盘顺序渲染，不再自行合成 user 消息。
- 渲染进程 UIMessage 组装逻辑（`ensureAssistantMessage` + `applyChunk`）抽成共享 composable `useUIMessageAssembler`，供 `chat` store 与 `proposal-run` store 共用；消除 `stores/chat.ts#streamSessionMessage` 与 `stores/proposal-run.ts#applyChunk` 之间的代码重复。
- chat 页面与 proposal SidePanel 的消息列表抽成共享组件（带 `type: "chat" | "side"` prop），SidePanel 与 chat 使用同一套 part 渲染（text / tool / reasoning），本次 change 不做样式差异化，仅预留 `type` prop 作为未来扩展点。
- 约定 message id 不跨进程同步：渲染进程在流式活跃期间使用自己 `generateId()` 的临时 id 驱动 DOM；主进程 `MessageAssembler.flush()` 时使用自己生成的 id 落盘；reload 后 UI 以磁盘返回的 id 为准，不在任何地方用 id 做跨进程匹配或去重。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `acp-chat-backend`: assistant 消息持久化职责由渲染进程迁至主进程；`chat:persistMessage` 语义收窄；主进程 chat stream handler 引入 `MessageAssembler`。
- `proposal-apply-run`: 新增 stage prompt 作为 user message 的即时持久化与 `user_message` chunk 推送；`loadRunMessages` 语义更新为返回 user+assistant 混合有序列表；新增 archive 独立落盘（`archive.json` meta + `archive.messages.jsonl`）、`proposal:loadArchive` / `proposal:loadArchiveMessages` IPC、`resumeArchive` 行为。
- `ipc-streaming`: `MessageChunkData` 新增 `user_message` 分支。
- `chat-interface`: chat 消息列表与 proposal SidePanel 使用同一消息列表组件渲染 `UIMessage.parts`，组件通过 `type` prop 区分使用场景。

## Impact

- **IPC 契约**：`MessageChunkData` 新增分支（`shared/types/ipc.ts`）；新增 `proposal:loadArchive` / `proposal:loadArchiveMessages` 两个 channel（`shared/types/channels.ts`、`shared/schemas/ipc/proposal.ts`）；`chat:persistMessage` 语义收窄（入参校验可收紧 `role === "user"`）。
- **存储布局**：`apply-runs/<changeId>/` 下新增 `archive.json` 与 `archive.messages.jsonl`；stage `{N}.messages.jsonl` 新增首行 user message（现存历史文件不迁移，新 run 自然具备）。
- **主进程**：`electron/main/ipc/chat.ts` 引入 `MessageAssembler` 并接管 assistant 落盘；`electron/main/ipc/proposal-apply.ts` 增加 stage user message 落盘、archive 落盘、archive 恢复 IPC；`electron/main/infra/storage/apply-run-store.ts` 新增 archive 读写函数与 `ArchiveRunMeta` 类型。
- **渲染进程**：新增 `frontend/src/composables/useUIMessageAssembler.ts`；新增共享消息列表组件（`frontend/src/components/shared/` 下，具体命名在 design 阶段敲定）；`stores/chat.ts` 改为使用共享 composable、去掉 `onDone` 内的 `persistMessage(assistant)` 调用；`stores/proposal-run.ts` 使用共享 composable、增加 `resumeArchive` 与 user_message chunk 处理；`ProposalApplySidePanel.vue` 替换消息列表部分为共享组件。
- **Spec**：`acp-chat-backend` / `proposal-apply-run` / `ipc-streaming` / `chat-interface` 均产出 delta。
- **测试**：`electron/main/__tests__/domain/chat/message-assembler.spec.ts` 既有；新增 chat IPC 集成测试覆盖 assistant 主进程落盘；新增 proposal apply stage user message 落盘测试与 archive 落盘/恢复测试；新增 `useUIMessageAssembler` 单测。
- **无外部依赖变化**：不引入新 npm 包。

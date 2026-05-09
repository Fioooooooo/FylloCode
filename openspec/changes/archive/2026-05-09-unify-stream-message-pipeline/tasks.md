## 1. 共享类型与 IPC 契约

- [x] 1.1 在 `shared/types/ipc.ts` 的 `MessageChunkData` 联合中新增 `{ kind: "user_message"; message: UIMessage<MessageMeta> }` 分支，更新相关 export
- [x] 1.2 在 `shared/types/channels.ts` 新增 `ProposalChannels.loadArchive` / `ProposalChannels.loadArchiveMessages`
- [x] 1.3 在 `shared/schemas/ipc/proposal.ts` 新增 `loadArchiveInputSchema` / `loadArchiveMessagesInputSchema`
- [x] 1.4 在 `shared/schemas/ipc/chat.ts` 收窄 `persistMessageInputSchema`：约束 `message.role === "user"`；同步更新 handler 侧的校验错误语义（保持 `VALIDATION_ERROR`）
- [x] 1.5 在 `shared/types/proposal.ts` 新增 `ArchiveRunMeta` 类型 `{ runId, changeId, status: "running" | "done" | "error", startedAt, updatedAt }`

## 2. 主进程：存储层

- [x] 2.1 在 `electron/main/infra/storage/apply-run-store.ts` 新增 `archiveRunMetaPath` / `archiveMessagesPath` 辅助函数
- [x] 2.2 新增 `saveArchiveRunMeta(projectPath, meta)` / `loadArchiveRunMeta(projectPath, changeId)` 读写 `archive.json`
- [x] 2.3 新增 `appendArchiveMessage(projectPath, changeId, message)` / `loadArchiveMessages(projectPath, changeId)` 读写 `archive.messages.jsonl`
- [x] 2.4 `electron/main/__tests__/infra/storage/apply-run-store.spec.ts`（新建或扩展）：archive 读写单测，覆盖正常、文件不存在、追加顺序

## 3. 主进程：Chat stream handler 接管 assistant 落盘

- [x] 3.1 在 `electron/main/ipc/chat.ts` 的 `streamMessage` handler 内部为每次调用创建 `MessageAssembler` 实例
- [x] 3.2 在 `text_delta` / `tool_call_start` / `tool_call_update` 分支调用 `assembler.apply(ev)`（保留 `toMessageChunk` + `sink.sendChunk` 转发）
- [x] 3.3 在 `done` 分支先执行 `assembler.flush()` → `appendMessage(projectPath, sessionId, message)`，再 `sink.sendDone`；落盘失败调用 `sink.sendError(ACP_ERROR, ...)`
- [x] 3.4 `persistMessage` IPC 的 handler 增加对 `message.role` 的显式校验，非 `"user"` 返回 `VALIDATION_ERROR`
- [x] 3.5 `electron/main/__tests__/ipc/chat.spec.ts`（新建或扩展）：覆盖 `done` 时主进程通过 `appendMessage` 写盘；覆盖 `persistMessage` 拒绝 assistant 消息

## 4. 主进程：Proposal stage user message 落盘 + user_message chunk

- [x] 4.1 在 `electron/main/ipc/proposal-apply.ts` 的 `proposal:stageStream` handler 的 `onReady` 里：构造 stage user `UIMessage<MessageMeta>`，调用 `appendApplyRunMessage` 写入 stage jsonl 首行，然后 `sink.sendChunk({ kind: "user_message", message })`
- [x] 4.2 user 落盘失败时抛出 `APPLY_RUN_PERSIST_FAILED` 经由 `makeStreamChannel` 的错误归一化路径发错
- [x] 4.3 确保 user 写入在 `sessionRegistry.register` 与 `session.start` 之前；`session.on("event", ...)` 的 `done` 分支已落盘 assistant 的行为保持现状
- [x] 4.4 单测覆盖：stage user message 首行写入、chunk 推送顺序、写入失败路径

## 5. 主进程：Archive 独立落盘

- [x] 5.1 在 `electron/main/ipc/proposal-apply.ts` 的 `proposal:archive` handler 的 `onReady` 里：构造 `ArchiveRunMeta`（status: "running"）→ `saveArchiveRunMeta`；构造 archive user message → `appendArchiveMessage`；`sink.sendChunk({ kind: "user_message", message })`
- [x] 5.2 引入 `MessageAssembler` 收集 archive 的 assistant 事件（替换当前 handler 中直接透传的实现；保留 `toMessageChunk` + `sink.sendChunk` 给渲染端实时渲染）
- [x] 5.3 `done` 分支：`assembler.flush()` → `appendArchiveMessage` → 更新 `archive.json` 的 `status: "done"` 与 `updatedAt`，然后 `sink.sendDone`
- [x] 5.4 `error` 分支：更新 `archive.json` 的 `status: "error"` 与 `updatedAt`，再 `sink.sendError`
- [x] 5.5 新增 handler：`proposal:loadArchive` → `loadArchiveRunMeta`；`proposal:loadArchiveMessages` → `loadArchiveMessages`；两个 handler 都用 `wrapHandler` + `validate`
- [x] 5.6 单测覆盖：archive meta 初始化、user 首行落盘、done 后 meta 与消息追加、error 分支 meta 更新、loadArchive/loadArchiveMessages 空文件行为

## 6. Preload / frontend API

- [x] 6.1 在 `electron/preload/api/proposal.ts` 暴露 `loadArchive(input)` / `loadArchiveMessages(input)`，更新 `electron/preload/index.d.ts` 类型
- [x] 6.2 在 `frontend/src/api/proposal.ts` 添加对应封装
- [x] 6.3 更新 preload `StreamCallbacks.onChunk` 与 frontend `chatApi.streamMessage` / `proposalApi.stageStream` / `proposalApi.archive` 的回调参数类型以匹配新的 `MessageChunkData`（TypeScript 穷尽检查通过）

## 7. 渲染进程：共享 UIMessage composable

- [x] 7.1 新建 `frontend/src/composables/useUIMessageAssembler.ts`：接受/持有 `Ref<UIMessage<MessageMeta>[]>`、暴露 `applyChunk` / `resetActive` / `setMessages`
- [x] 7.2 `applyChunk` 内部处理 `text_delta` / `tool_call_start` / `tool_call_update` / `user_message` 四种 kind；`user_message` 将消息原样 push 并清空 `activeAssistantId`
- [x] 7.3 新建 `frontend/src/composables/__tests__/useUIMessageAssembler.spec.ts`：覆盖 text delta 累加、tool call 转 output-available、user_message 插入、assistant 在 user_message 之后续组装

## 8. 渲染进程：Chat store 接入 composable 并移除 assistant persist

- [x] 8.1 `frontend/src/stores/chat.ts#streamSessionMessage` 改用 `useUIMessageAssembler`（传入 `activeSession.messages` ref 或通过 `setMessages` 同步）
- [x] 8.2 移除 `onDone` 内对 assistant message 的 `persistMessage` 调用；`persistMessage(user)` 调用保留
- [x] 8.3 清理 store 内 `ensureAssistantMessage`、`activeAssistantId`、`activeTextPartIdx` 局部状态（由 composable 接管）
- [x] 8.4 更新 `frontend/src/stores/__tests__/chat.spec.ts`（新建或扩展）：覆盖 `onDone` 不再触发 persist assistant、user persist 行为不变

## 9. 渲染进程：Proposal-run store 接入 composable + user_message + resumeArchive

- [x] 9.1 `frontend/src/stores/proposal-run.ts` 改用 `useUIMessageAssembler`；删除 `ensureAssistantMessage` / `applyChunk` 本地实现
- [x] 9.2 新增 `resumeArchive(projectId, changeId)`：调用 `proposal:loadArchive` / `proposal:loadArchiveMessages`，赋值 `runMeta`（构造只含 archive 信息的 ApplyRunMeta 视图 或新增 `archiveRunMeta` ref——在设计上选后者）与 `messages`
- [x] 9.3 `startArchive` / `streamCurrentStage` 的 onChunk 中 `applyChunk` 调用自然处理 `user_message`（无需额外代码）
- [x] 9.4 `frontend/src/stores/__tests__/proposal-run.spec.ts`（新建或扩展）：覆盖 stage user_message chunk 顺序插入、archive user_message 插入、resumeArchive 行为

## 10. 渲染进程：共享消息列表组件

- [x] 10.1 新建 `frontend/src/components/shared/UIMessageList.vue`，props `{ messages: UIMessage<MessageMeta>[]; isStreaming: boolean; type: "chat" | "side" }`；内部使用 `isReasoningUIPart` / `isTextUIPart` / `isToolUIPart` 派发到 `UChatMessages` / `UChatTool` / `ChatComark`
- [x] 10.2 保证组件内部不含任何基于 `type` 的条件分支（TS 校验 + 代码审查）
- [x] 10.3 `frontend/src/components/chat/ChatContainer.vue` 将现有消息列表 `v-for` 块替换为 `<UIMessageList :messages :isStreaming type="chat" />`
- [x] 10.4 `frontend/src/components/proposal/ProposalApplySidePanel.vue` 将现有消息列表 `v-for` 块替换为 `<UIMessageList :messages :isStreaming type="side" />`，保留外壳（title、stage 进度条、关闭按钮、空态、流式指示器）
- [x] 10.5 组件单测（`frontend/src/components/shared/__tests__/UIMessageList.spec.ts`）：text part / dynamic-tool part 渲染、空列表、isStreaming 指示器
- [ ] 10.6 在 `pnpm dev` 下人工验证 chat 主区域和 proposal SidePanel 渲染效果：消息与工具调用显示一致；SidePanel 窄宽下无溢出；流式期间消息实时刷新

## 11. Proposal 详情页接入 resumeArchive

- [x] 11.1 `frontend/src/pages/proposal/[id].vue` 的 `onMounted`：在检查 `status === "applying"` 之外，若存在 `archive.json`（通过 `proposal:loadArchive` 判定）则调用 `resumeArchive`（或根据 design 阶段敲定的条件触发）
- [x] 11.2 如 design 约定 `status === "archiving"` 作为触发条件，则同步在 `shared/types/openspec-status.ts` 或 proposal status 定义中补齐枚举（若已有 `archiving`，直接对齐）；若不新增状态，则以"archive.json 存在且 archive.status !== 'running' 以外"作为判定

## 12. 文档与 spec 同步

- [x] 12.1 更新 `docs/IPC.md` 的 Chat / Proposal 章节，新增 `proposal:loadArchive` / `proposal:loadArchiveMessages`，标注 `chat:persistMessage` 仅用于 user
- [x] 12.2 更新 `docs/DataModel.md` 的 apply-run 存储布局，加入 `archive.json` 与 `archive.messages.jsonl`
- [ ] 12.3 按 OpenSpec 流程在 change archive 阶段把 delta 合入 `openspec/specs/acp-chat-backend/spec.md` / `openspec/specs/proposal-apply-run/spec.md` / `openspec/specs/ipc-streaming/spec.md` / `openspec/specs/chat-interface/spec.md`（archive 时执行，不在实现 tasks 内）

## 13. 验证与回归

- [x] 13.1 `pnpm typecheck` 全量通过（关注 `MessageChunkData` 穷尽检查）
- [x] 13.2 `pnpm lint` 通过
- [x] 13.3 `pnpm test` 全量通过（含新增单测）
- [x] 13.4 `pnpm dev` 手工回归：
  - chat 发送含 tool 调用的消息 → 刷新页面后 assistant 消息从磁盘恢复，展示一致
  - proposal apply 单 stage → SidePanel 先显示 user prompt 再显示 assistant；stage 完成后刷新页面，消息按 user→assistant 顺序恢复
  - proposal apply 多 stage 串行 → 每个 stage 切换时 `messages` 重置为新 stage 的 user + assistant 顺序
  - proposal archive → SidePanel 显示 archive user prompt 与 assistant 输出；刷新页面后通过 resumeArchive 恢复
  - 窄宽 SidePanel 下共享组件无布局溢出

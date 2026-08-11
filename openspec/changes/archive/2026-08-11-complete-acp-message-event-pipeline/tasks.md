## 1. 共享工具事件契约与纯归并

- [x] 1.1 更新 `src/shared/types/stream-event.ts`，新增 `ToolCallStatus` 四态，为 start 保留规范 status、为 update 保留可选 status，并让 diff/locations 能用空数组表达显式 replacement；更新 `test/shared/` 或 Main mapper fixture，验收标准是类型可以区分字段缺失与显式清空且不再排除 `pending`。
- [x] 1.2 新建 `src/shared/chat/tool-call-assembly.ts`，实现框架无关的 tool part reducer 与 metadata 安全读取：统一合并 identity/title/input/toolKind/parent/subagent，按属性存在性替换 diff/locations，保存 `acpStatus`，并把四态映射为 `input-streaming`、`input-available`、`output-available`、`output-error`；不得写 Renderer 专属 `liveOutput`。
- [x] 1.3 为共享 reducer 建立覆盖 pending、无 status patch、孤立 update、replacement 清空/替换、completed、failed、延迟 parent/subagent 和无效重复 update 的 fixture 测试；验收标准是每个 fixture 都断言 part、累计 output 与“是否实际变化”结果。

## 2. ACP mapper 与内部 dispatch metadata

- [x] 2.1 修改 `src/main/services/session/chat/acp-mapper/tool-call-mapper.ts` 和 `acp-mapper/update-normalizers.ts`：start 使用 ACP status 或 pending fallback，update 不再默认 in_progress，并按 ACP 0.25 replacement contract 为显式 content/locations 产生包括空数组在内的 diff/location 值；扩展 `test/main/services/session/chat/acp-mapper/tool-call-mapper.spec.ts` 覆盖四态、字段缺失和显式清空。
- [x] 2.2 在 `src/shared/types/ipc.ts`、`src/main/domain/session/chat/session-events.ts`、`src/main/services/session/chat/session-event-mapper.ts` 与 `src/main/services/session/chat/acp-session.ts` 接入非 ACP `turn_metadata` 通知；从实际 dispatch 的 config option category `model` / `thought_level` 提取 currentValue，携带调用方提供的 `userMessageId` 与 dispatchedAt，缺失 category 时不猜测。
- [x] 2.3 扩展 `test/main/services/session/chat/acp-session.spec.ts` 与 `test/main/services/session/chat/acp-stream-driver.spec.ts`，验证通知只在底层 Prompt 已 dispatch 且现有 callback 成功后产生、先于/晚于内容均可消费、不会单独创建 assistant message，并能通过 stream chunk 到达 Renderer。

## 3. 双 assembler 接入共享规则

- [x] 3.1 重构 `src/main/domain/session/chat/message-assembler.ts` 使用 `tool-call-assembly.ts`，让只含 diff/location/status 的 update 生效、failed 产生 `output-error`、每次实际 part/metadata 变化推进 updatedAt，并缓存/应用 turn metadata；保留 `snapshot()` / `flush()`、独立 ID 和不持久化 liveOutput 的现有职责。
- [x] 3.2 重构 `src/renderer/src/composables/useUIMessageAssembler.ts` 使用同一 reducer，继续在 Renderer 外层维护 reasoning `streaming/done`、active 临时 ID 和 `liveOutput`；处理 turn metadata 时精确 patch userMessageId 并缓存/更新 assistant audit metadata。
- [x] 3.3 扩展 `test/main/domain/session/chat/message-assembler.spec.ts` 与 `test/renderer/src/composables/use-ui-message-assembler.spec.ts`，用 1.3 的相同 fixture 比较去除 ID、时间和 Renderer 专属字段后的持久字段，覆盖流式完成、失败、取消 partial、历史重载和旧 part fallback。

## 4. 消息审计元数据与安全持久化

- [x] 4.1 更新 `src/shared/types/chat.ts` 的 `MessageMeta`，增加向后兼容的 `updatedAt?`、`model?`、`effort?`；更新 `src/renderer/src/stores/session/session.ts#normalizeMessage` 同时恢复 createdAt/updatedAt，并让缺少 updatedAt 的旧消息在内存回退 createdAt，保持 model/effort 缺失。
- [x] 4.2 更新所有新版 user message constructor：`src/renderer/src/stores/session/chat.ts#buildUserMessage`、`src/main/ipc/proposal/runtime.ts#buildProposalRunUserMessage`、`src/main/services/session/spawn/spawned-session-manager.ts#userMessage`、`src/main/services/session/chat/chat-turn-service.ts#notificationMessage`，保证初始 updatedAt 等于 createdAt 且不增加 Agent 字段。
- [x] 4.3 抽取按 message file 串行的 JSONL mutation helper，并让 `src/main/infra/storage/session-store.ts`、`apply-run-store.ts`、`spawned-session-store.ts` 的 append 与 `message-reminder-store.ts` 的 reminder rewrite 复用同一 per-file queue；新增按精确 message ID patch `MessageMeta` 的原子写能力，损坏行必须保留原文件并报告行号。
- [x] 4.4 在 `src/main/services/session/chat/chat-turn-service.ts`、`src/main/ipc/proposal/apply.ts`、`src/main/ipc/proposal/archive.ts` 和 `src/main/services/session/spawn/spawned-session-manager.ts` 把本轮 userMessageId 交给 turn driver，并在 turn_metadata 到达时 patch user message；Main assembler 为对应 assistant 写相同 model/effort，后续 session config update 不得回写旧消息。
- [x] 4.5 扩展 `test/main/infra/storage/session-store.spec.ts`、`message-reminder-store.spec.ts`、`apply-run-store.spec.ts`、`spawned-session-store.spec.ts` 以及对应 Chat/Proposal/Spawn service 测试，覆盖 append 与 patch 串行、损坏 JSONL 不覆盖、旧字段兼容、dispatch 前失败不猜测和各流程 user/assistant snapshot 一致。

## 5. Renderer 工具状态、diff 与 location 展示

- [x] 5.1 扩展 `src/renderer/src/utils/chatTool.ts`，提供 `acpStatus`（含旧 AI state fallback）、状态中文、errorText、diff、locations 的安全读取；更新 `test/renderer/src/utils/chat-tool.test.ts` 覆盖新旧工具 part 与非法 metadata。
- [x] 5.2 修改 `src/renderer/src/components/chat/message/ChatToolItem.vue` 与 `ChatActivityGroup.vue`，让每个具体工具以文字展示等待执行/正在执行/已完成/失败并继续复用现有 `UChatTool` streaming 视觉；Activity group header 保持既有类别摘要与图标规则。
- [x] 5.3 扩展 `ChatToolDetails.vue`（必要时拆出相邻的专用展示组件），在 Input/Output 之外按需展示 Error、Changes、Locations：diff 按 path 顺序显示新增或完整“修改前/修改后”只读滚动区，空字段不渲染；不得截断底层值或新增外部依赖。
- [x] 5.4 从 `@renderer/features/local-file-preview` 公共入口复用 `useLocalFilePreview()`：合法绝对 location 点击时以 path 和可选 line 打开既有窗口级 Slideover，不合法/相对路径只显示文本且不发 IPC；不得由 Chat 组件直接访问 `window.api` 或创建第二套文件读取能力。
- [x] 5.5 扩展 `test/renderer/src/components/shared/ui-message-list.spec.ts` 或新增镜像 chat message 组件测试，覆盖直接工具与 Activity group 子工具的四态文字、失败 Error、多个/new-file diff、带/不带 line 的 location、键盘激活、非候选路径不预览，以及实时/历史相同展示。

## 6. 回归验证

- [x] 6.1 运行与变更直接相关的 Main/Shared Vitest 文件，包括 ACP mapper、AcpSession/stream driver、两套 assembler、消息 JSONL storage、Proposal 和 Spawn 流程；修复失败且不得改动本 Proposal 明确排除的 control event 策略。
- [x] 6.2 运行 Renderer 聚焦测试和 `pnpm typecheck`、`pnpm lint`；人工检查浅色/深色与窄窗口下工具折叠、长 diff 滚动、四态文字、location focus/preview，并确认 `ChatMessageActions` / `MessageTime` 未展示 model、effort 或 updatedAt。
- [x] 6.3 运行 `git diff --check` 并审查最终 diff，确认没有 `usage_update`、plan/session_info/current_mode 行为变化，没有每消息 Agent、没有 Main/Renderer ID 同步，也没有把 `liveOutput` 或 indicator 状态写入 JSONL。

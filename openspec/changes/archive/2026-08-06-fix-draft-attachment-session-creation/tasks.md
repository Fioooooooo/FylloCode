## 1. 固定 Renderer 回归用例

- [x] 1.1 更新 `test/renderer/src/components/chat-prompt-panel.spec.ts` 的 PromptActionMenu stub，使一次事件可提交多个 `File`，并让 `createSession` mock 使用 deferred IPC 后才改变状态；验收标准：ready probe 草稿一次选择多个附件、草稿分两次选择附件都断言提交前 `createSession/saveAttachment` 调用数为 0，Session 仍未 active，全部预览仍存在。
- [x] 1.2 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖必填 text：空字符串、纯空白以及“仅附件”时 submit disabled 且 `sendMessage` 不调用；非空 text 加附件时允许提交，并且失败返回时保留 textarea 与附件、成功返回时才清空。
- [x] 1.3 在 `test/renderer/src/stores/session/chat.spec.ts` 增加 ready probe 首发多附件事务测试，使用 deferred create/save/persist response 逐阶段断言：只创建一个 Session、标题来自首个非 system-reminder text、全部 save target 等于创建结果 ID、durable append 前列表/active 不变、成功后复用 probe ACP Session并按选择顺序发送 handles。
- [x] 1.4 在 `test/renderer/src/stores/session/chat.spec.ts` 增加直接 store 调用的空 text/system-reminder-only 拒绝，以及 Session 创建、部分附件保存、首条 Message 持久化和 scope 变化失败场景；验收标准：失败不 stream、不清除 ready probe，已创建 Session 调用 remove，迟到结果不激活，重试仍可重新物化附件。

## 2. 拆分 Session 持久化创建与本地激活

- [x] 2.1 修改 `src/renderer/src/stores/session/session.ts` 的 `SessionStore` contract 与 `createSession()`，增加默认 `activate: true` 的 options；`activate: false` 时只返回 normalized Main 结果，不修改 `sessions`、`activeSessionId`、`loadedSessionIds` 或 origin task projection。
- [x] 2.2 在 `src/renderer/src/stores/session/session.ts` 新增 `activateCreatedSession(session)`，集中复用原 `createSession()` 的列表去重插入、active 设置、loaded 标记和 `ensureSessionOriginTaskInfo()` 逻辑；更新 `test/renderer/src/stores/session/session.spec.ts`，分别验证默认兼容行为、deferred create 不可见及显式激活后的状态。

## 3. 重构草稿附件生命周期

- [x] 3.1 修改 `src/renderer/src/composables/useChatAttachment.ts`，移除 `ensureAttachmentSession()` 和附件选择阶段的草稿 Session 创建；维护 `attachment.id -> File` 临时映射，草稿选择只创建 `ChatPromptAttachment` 与预览，删除/清空/卸载时同步释放 File 引用和 object URL。
- [x] 3.2 在 `useChatAttachment()` 中实现 `materializeAttachmentParts({ workspaceId, sessionId })`：已有 active Session 的已保存 handles直接投影，草稿附件使用传入的固定 target读取并保存，所有返回 parts保持选择顺序；`hasPendingAttachments` 只反映真实保存请求，不能因草稿 attachmentId 为 null 阻止非空 text 提交。
- [x] 3.3 保持已有 Session 的预保存路径：选择多个或分次选择附件时，所有 `chatApi.saveAttachment()` 调用使用选择瞬间固定的 active `workspaceId/sessionId`，不得读取随后变化的 active Session重新定向；在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 或新增 `test/renderer/src/composables/useChatAttachment.spec.ts` 验证不会创建其他 Session且 handles 均可用于当前 Session。

## 4. 实现首条消息的两阶段提交

- [x] 4.1 修改 `src/renderer/src/composables/useChatPrompt.ts` 与 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue`：将 `input.trim().length === 0` 纳入 submit disabled 和 `handleSubmit()` guard，把 `materializeAttachmentParts` callback传给 Chat store，并只在 store 明确返回成功时执行 `clearAttachments()`、清空 input 与 temporary placeholder。
- [x] 4.2 修改 `src/renderer/src/stores/session/chat.ts` 的 `sendMessageCore()`/`sendMessage()`：在建立 draft run 前验证至少一个非 system-reminder text part trim 后非空；保留 `buildFallbackSessionTitle()` 的 `**标题**:` 优先、空白归一化与 30 Unicode code point规则，并让 `sendMessage()` 返回可供 composer判断的显式成功结果。
- [x] 4.3 在 `sendMessageCore()` 草稿分支中固定 Workspace、Agent 与 ready probe snapshot，调用 `sessionStore.createSession(..., { activate: false })` 后再以返回 ID物化全部附件；先通过现有 `chatApi.persistMessage()` durable append首条 user message，再调用 `activateCreatedSession()`、建立 session stream state、清除 renderer probe snapshot并以 probe `acpSessionId` 启动 stream。
- [x] 4.4 为 `sendMessageCore()` 增加未提交 Session cleanup：创建后至 durable append 前任一步失败或 run/scope失效时，以创建时固定的 `workspaceId/sessionId` 调用现有 remove API，清除当前 draft run但保留 probe；cleanup二次失败只记录错误，不覆盖最初提交错误。验收标准：左侧列表不出现空 Session，附件副本由现有 remove handler一并删除，composer 可原样重试。
- [x] 4.5 保持已有 active Session 路径：以发送开始时固定的 Session target物化/收集附件，继续执行现有 optimistic queue、persist 与并行 stream；验证本次改动不改变 Agent `session_info_update` 覆盖标题、并行 Session stream 和 `sendMessageAndAwaitDurableAppend()` 行为。

## 5. 落实 Main attachment scope 校验

- [x] 5.1 修改 `src/main/ipc/session/chat.ts` 的 `saveAttachment` 与 `readAttachmentDataUrl` handler，使用 IPC event调用 `requireWorkspaceSender(event.sender, form.workspaceId)`，再调用 `assertSessionBelongsToWorkspace(form.workspaceId, form.sessionId)`，通过后才进入现有 `attachment-store`；不修改 shared schemas、handle格式或存储路径。
- [x] 5.2 更新 `test/main/ipc/session/chat.spec.ts`，验证 attachment 保存/读取会拒绝错误 sender Workspace、不存在或不属于该 Workspace 的 Session，并在合法 Session 中继续返回 opaque handle/data URL；保留 `test/main/infra/storage/attachment-store.test.ts` 的跨 Session解析拒绝断言。

## 6. 验证质量门禁

- [x] 6.1 在 Proposal worktree 首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，然后运行 renderer 聚焦测试：`pnpm exec vitest run --project renderer test/renderer/src/components/chat-prompt-panel.spec.ts test/renderer/src/stores/session/chat.spec.ts test/renderer/src/stores/session/session.spec.ts`（若新增 composable spec则一并加入）。
- [x] 6.2 运行 Main 聚焦测试 `pnpm exec vitest run --project main test/main/ipc/session/chat.spec.ts test/main/infra/storage/attachment-store.test.ts`，确认 sender/Session scope 与跨 Session handle拒绝均通过。
- [x] 6.3 运行 `pnpm typecheck` 与 `pnpm lint`；验收标准：无新增 TypeScript、ESLint 错误，且没有修改 Session/Message schema、附件目录、opaque handle contract 或项目 guideline。

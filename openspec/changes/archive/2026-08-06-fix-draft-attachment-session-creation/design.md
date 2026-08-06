## Context

当前 `useChatAttachment()` 在选择每个文件时分别调用 `ensureAttachmentSession()`。草稿态没有 active Session 时，每个并行调用都会在首个 IPC 返回前观察到 `activeSession === null`，从而各自调用 `sessionStore.createSession()`。该 action 在 IPC 返回后立即把新 Session 插入列表并设为 active，导致用户未发送消息即看到一个或多个 `New Session`。随后 `sendMessageCore()` 因已有 active Session 而绕过 `buildFallbackSessionTitle()` 和 ready probe promotion，并把分属不同 Session 的 attachment handles 一起发送；Main 按最终 active Session 解析 handles 时正确拒绝其他 Session 的附件。

另一个现状是 `useChatPrompt.handleSubmit()` 仅在 text 与 attachments 同时为空时返回，`sendMessageCore()` 也把任意非 text part 视为有效内容，因此仅附件消息目前可以通过。产品契约要求每次用户消息都必须携带 trim 后非空的可见 text。

现有 opaque attachment 契约必须保持不变：副本只落在 `<workspaceDataDir>/sessions/<sessionId>/attachments`，公开身份仍为 `attachmentId`，Main 构造 ACP prompt 时才解析副本。ready probe 已提供 `fylloSessionId`、`acpSessionId`、config options 与 commands，正常首发应继续通过 `createSession()` 将该 probe 提升为 Chat。

## Goals / Non-Goals

**Goals:**

- 让 renderer UI 与 store 提交入口共同执行“每次消息必须含非空用户 text”的约束。
- 草稿态选择附件时不创建、持久化、展示或激活 Session。
- 首次提交只创建一个真实 Session，先确定标题和 probe promotion identity，再把全部附件保存到这个固定 Session。
- 只有首条 user message 成功持久化后才把新 Session 提交到 renderer 列表并设为 active。
- 在首发前置步骤失败时删除新建 Session 及附件、保留草稿输入和 ready probe，允许用户重试。
- 保持已有 Session 选择附件后立即保存到当前 Session 的行为。
- 让 attachment 保存与读取 IPC 显式验证 sender Workspace 和 Session ownership。

**Non-Goals:**

- 不改变 Session、Message、ProbeSnapshot 或 ChatPromptPart 的 shared schema。
- 不改变 `attachmentId` 格式、附件目录结构、大小限制、MIME capability 判断或 ACP image/resource link 转换。
- 不引入 probe-scoped 临时附件目录，也不允许尚未持久化的 probe identity 作为 attachment owner。
- 不改变 Agent `session_info_update` 后续覆盖 fallback title 的既有行为。
- 不新增 Main 侧批量附件或原子“创建并发送”IPC。

## Decisions

### 1. 草稿附件保留在 renderer，真实 Session 创建后才持久化

`useChatAttachment()` 继续拥有附件选择、预览 URL 和清理，但需要保存 `attachment.id -> File` 的临时映射。草稿态选择文件时只创建 `ChatPromptAttachment` view model，`attachmentId` 保持 `null`，不调用 `sessionStore.createSession()` 或 `chatApi.saveAttachment()`。已有 active Session 时继续立即读取并保存文件到该 Session。

该 composable 新增 `materializeAttachmentParts(target)`（`target` 包含固定 `workspaceId/sessionId`）：按用户选择顺序处理附件；已有 `attachmentId` 的条目直接投影为 prompt part，未持久化条目读取临时 `File` 并通过 `chatApi.saveAttachment()` 保存到传入的同一 Session。返回的 `ChatPromptPart[]` 保持 UI 顺序。`hasPendingAttachments` 只表示实际的保存请求仍在执行，不能再把草稿态的 `attachmentId === null` 永久视为不可提交。

选择这一方案而不是直接写入 ready probe 的 `fylloSessionId`，因为现有规范只授权真实 Session 拥有附件；probe staging 需要额外的授权、取消、Agent 切换、probe 失效和垃圾回收契约。选择在 renderer 分阶段编排而不是新增批量 Main IPC，是为了复用现有 create/save/persist/remove 契约，避免一次 IPC 携带多个大型 base64 文件。

### 2. Session store 将持久化创建与本地激活拆开

扩展 `useSessionStore().createSession(input, options?)`，其中 `options.activate` 默认 `true` 以保持既有调用语义；草稿首发传入 `{ activate: false }` 时只调用 `chatApi.createSession()` 并返回 normalized Session，不修改 `sessions`、`activeSessionId` 或 `loadedSessionIds`。新增 `activateCreatedSession(session)`，集中执行当前 create action 的列表插入、active 设置、loaded 标记和 origin task 信息补全。

这使 `sendMessageCore()` 可以先获得 Main 已持久化、且已完成 ready probe snapshot 校验的真实 `sessionId`，但在附件和首条 user message成功前不向 renderer 提交可见 Session。若前置步骤失败，以创建时固定的 `workspaceId/sessionId` 直接调用现有 remove API；Main 的 remove handler会同时删除 Session meta/messages 与 attachments，而 renderer 因从未激活该 Session 不发生列表切换。cleanup 不能依赖失败时的当前 Workspace，因为 scope 变化正是触发回滚的场景之一。

### 3. Chat store 拥有首次提交事务的顺序

`useChatPrompt()` 将用户输入 text 与 `materializeAttachmentParts` callback 交给 `chatStore.sendMessage()`。`sendMessageCore()` 先从非 system-reminder text part 中取得 trim 后非空的用户文本；不存在时在任何 Session 创建、消息入队或 stream 状态变更前拒绝提交。

草稿首发按以下顺序执行：

1. 固定 `workspaceId`、`draftAgentId`、ready probe、text 和 fallback title；标题继续复用 `buildFallbackSessionTitle()` 的结构化 `**标题**:` 优先、空白归一化和最多 30 个 Unicode code point 规则。
2. 使用 probe 的 `fylloSessionId/acpSessionId/configOptions/availableCommands` 调用 `createSession(..., { activate: false })`；无 ready probe 时仍创建普通 Session。
3. 以返回 Session 的 `id` 调用 `materializeAttachmentParts()`，同批附件只能写入该固定 identity。
4. 构造首条 user message并先通过 `chatApi.persistMessage()` 完成 durable append。
5. 调用 `activateCreatedSession()`，把同一 message 加入本地 Session、建立 stream state；只有此时才清除 renderer probe snapshot并以 `acpSessionId` 启动 stream。

步骤 2 至 4 任一失败时，在 `finally/catch` 中删除未提交 Session，清除本次 draft stream state，但不调用 `applyProbeUpdate(..., null)`。`sendMessage()` 返回显式成功结果；`useChatPrompt.handleSubmit()` 仅在成功时清空 input 和附件，失败时保留 composer 内容。

已有 Session 的发送不创建或激活 Session；callback 使用当前固定 Session target 等待尚在执行的保存并返回 prompt parts，然后沿用现有 optimistic message、persist 和 stream 路径。

### 4. 必填 text 在 UI 与 store 两层执行

`ChatPromptPanel.vue` 的 submit disabled 条件加入 `input.trim().length === 0`，使空 text 时按钮不可用，无论是否存在附件。`useChatPrompt.handleSubmit()` 保留同样的 guard，防止通过键盘或组件事件绕过按钮。`sendMessageCore()` 再验证至少一个非 system-reminder `text` part 在 trim 后非空，保护任务联动等非组件调用方。

该规则不允许用附件 filename、附件摘要、system reminder 或其他 prompt part 替代用户 text。由于首条消息必有 text，Session fallback title 不再因附件首发退化为 `New Session`。

### 5. Main 在写入或读取附件前验证 scope

`src/main/ipc/session/chat.ts` 的 `saveAttachment` 与 `readAttachmentDataUrl` handler 使用真实 IPC event，先通过 `requireWorkspaceSender(event.sender, form.workspaceId)` 验证窗口 Workspace，再调用 `assertSessionBelongsToWorkspace(form.workspaceId, form.sessionId)`，最后进入现有 attachment store。该变更落实 `acp-multi-root-session` 已有约束，不新增 shared schema。

## Risks / Trade-offs

- [创建 meta 后、消息 durable append 前存在一个短暂的磁盘 Session] → renderer 不激活该 Session；任何失败都调用 remove handler 清理 meta、message 文件和附件。实现测试必须用 deferred IPC 证明等待期间列表和 active 状态不变。
- [删除回滚失败可能留下不可见空 Session] → 记录错误并向用户显示原始提交失败；删除接口保持幂等，后续 Session list reload会暴露残留以便用户手动删除。测试覆盖正常回滚，日志覆盖 cleanup 二次失败。
- [多个附件部分成功后某个失败] → 整个未提交 Session 统一删除，不能把成功 handles 复用到重试 Session；composer 保留原始 `File` 映射，重试时重新上传到新 Session。
- [用户在提交期间切换 Workspace、Session 或 Agent] → 复用现有 draft run ID 与 Workspace snapshot/generation 检查；scope 变化时取消提交并回滚刚创建的 Session，迟到结果不得激活。
- [较大附件在点击发送后才开始持久化，增加首次发送等待] → 提交阶段显示现有 submitted/pending 状态并禁止重复提交；已有 Session 仍在选择时预保存，不承担该延迟。

## Migration Plan

不需要数据迁移。实现先增加回归测试，再调整 renderer 提交编排与 Main scope 校验。回滚代码不会改变已持久化 Session、Message 或附件格式；回滚前已创建的数据仍可由旧版本读取。

## Open Questions

无。产品已确认附件不能单独发送，草稿附件必须等真实 Session 创建成功后再持久化。

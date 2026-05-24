## ADDED Requirements

### Requirement: chat:stream:message 接受 ChatPromptPart 数组

系统 SHALL 把 `chat:stream:message` IPC 的 `prompt` 字段类型从 `string` 改为 `ChatPromptPart[]`。`shared/types/chat-prompt.ts` SHALL 暴露：

```ts
type ChatPromptPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; uri: string; filename: string }
  | { type: "resource_link"; uri: string; mediaType: string; filename: string };
```

`shared/schemas/ipc/chat.ts` 的 `streamMessageInputSchema.prompt` SHALL 改为 `z.array(chatPromptPartSchema).min(1)`。`chatPromptPartSchema` 为 zod discriminated union，type 字段作为 discriminator。

`chatApi.streamMessage(...)` 的第四参数 SHALL 从 `prompt: string` 改为 `parts: ChatPromptPart[]`。preload `electron/preload/api/chat.ts` 同步改造。

#### Scenario: 单 text part 兼容旧用法

- **WHEN** 渲染进程发送只含 text 的消息
- **AND** 调 `chatApi.streamMessage(sessionId, projectId, agentId, [{ type: "text", text: "hello" }], callbacks)`
- **THEN** 主进程校验通过，进入 `AcpSession.start`

#### Scenario: 空数组被拒

- **WHEN** 渲染进程传入 `parts: []`
- **THEN** 主进程返回 `IpcResponse.error({ code: "VALIDATION_ERROR" })`

#### Scenario: 不合法 type 被拒

- **WHEN** 渲染进程传入 `[{ type: "audio", ... }]`（v1 不支持 audio）
- **THEN** zod 校验失败，返回 `VALIDATION_ERROR`

### Requirement: AcpSession.start 接受多 part 输入并按能力分叉转 ContentBlock

`AcpSession.start(parts: ChatPromptPart[]): AsyncIterable<SessionEvent>` 接受多 part 输入。在调用 `connection.prompt({ ..., prompt })` 之前，系统 SHALL 把 `parts` 转换为 ACP `ContentBlock[]`：

- `text` part → ACP `{ type: "text", text }`
- `image` part：从 `uri`（`file://`）读出二进制，base64 编码，输出 ACP `{ type: "image", mimeType: <part.mediaType>, data: <base64> }`
- `resource_link` part → ACP `{ type: "resource_link", uri, name: <part.filename>, mimeType: <part.mediaType> }`

转换 SHALL 在能力 gating 之后执行：

- 含 `image` part 时，`agentCapabilities.promptCapabilities.image` SHALL 为 `true`，否则 `start` SHALL 返回 `IpcResponse.error({ code: "PROMPT_CAPABILITY_MISMATCH", message })`
- 含 `resource_link` part 时，`promptCapabilities.embeddedContext` SHALL 为 `true`，否则同上

reminder 注入仍以 `text` ACP `ContentBlock` 形式置于 `prompt` 数组首位（不变）。

#### Scenario: 图片 part 被读盘并 base64 编码

- **WHEN** `parts` 包含 `{ type: "image", mediaType: "image/png", uri: "file:///abs/path.png", filename: "shot.png" }`
- **AND** agent `promptCapabilities.image === true`
- **THEN** `AcpSession.start` 通过 `fs.readFile` 读取该路径
- **AND** 在 ACP `prompt` 数组中插入 `{ type: "image", mimeType: "image/png", data: <base64> }`

#### Scenario: 文件 part 直接转 resource_link

- **WHEN** `parts` 包含 `{ type: "resource_link", uri: "file:///abs/doc.pdf", mediaType: "application/pdf", filename: "doc.pdf" }`
- **AND** agent `promptCapabilities.embeddedContext === true`
- **THEN** ACP `prompt` 数组中包含 `{ type: "resource_link", uri: "file:///abs/doc.pdf", name: "doc.pdf", mimeType: "application/pdf" }`
- **AND** 不读取文件内容（仅传 URI）

#### Scenario: capability 不满足时拒绝发起 prompt

- **WHEN** `parts` 含 `image` part
- **AND** agent `promptCapabilities.image === false`
- **THEN** `AcpSession.start` 不调 `connection.prompt`
- **AND** 返回 `IpcResponse.error({ code: "PROMPT_CAPABILITY_MISMATCH" })`
- **AND** 不修改 ACP session 状态

#### Scenario: reminder text part 仍位于首位

- **WHEN** 当前 turn 走 `newSession` 分支注入了 reminder
- **AND** `parts` 为 `[{ type: "text", text: "请改 X" }, { type: "image", ... }]`
- **THEN** ACP `prompt` 数组顺序为 `[reminderTextBlock, userTextBlock, userImageBlock]`

### Requirement: user message 持久化支持多 part

主进程在 user message 落盘时（`chat:persistMessage`）SHALL 接受 `Message.parts` 包含 `text` 与 AI SDK `FileUIPart` 的混合数组：

```ts
{ type: "file", mediaType: string, url: string, filename: string }
```

`shared/schemas/ipc/chat.ts` 的 `persistMessageInputSchema` SHALL 校验 user message 的 `parts` 至少包含一个 `text` part；附件 part 仅允许 `type: "file"`，其 `url` SHALL 为 `file://` URI。

#### Scenario: 持久化含附件的 user message

- **WHEN** 渲染进程调 `chat:persistMessage` 传入 user message，其 `parts` 含 `text` + `file` part
- **THEN** 主进程校验通过，写入 `<sessionId>.messages.jsonl` 一行 JSON

#### Scenario: 持久化只含附件无 text 时被拒

- **WHEN** user message 的 `parts` 没有任何 `text` part（即使有 file part）
- **THEN** 校验失败，返回 `VALIDATION_ERROR`

## MODIFIED Requirements

### Requirement: removeSession IPC 删除 session 文件

系统 SHALL 实现 `chat:removeSession` IPC handler，删除 session 的元数据文件、消息文件，以及 session 关联的所有附件文件。

#### Scenario: 删除 session

- **WHEN** 渲染进程调用 `chat:removeSession` 并传入 `{ id, projectId }`
- **THEN** 主进程删除 `<sessionId>.json` 和 `<sessionId>.messages.jsonl` 文件
- **AND** 调 `attachment-store.removeSessionAttachments(projectPath, sessionId)` 递归删除 `<sessionId>/attachments/` 目录
- **AND** attachments 目录不存在时不抛错，整体仍返回 ok

### Requirement: AcpSession 构造参数承载 owner 与 reminder 注入钩子

`AcpSessionOpts` SHALL 包含以下字段：

- `fylloSessionId: string`
- `agentId: string`
- `projectPath: string`
- `cwd: string`
- `owner: SessionOwner`（复用 `@main/services/chat/session-registry#SessionOwner`）
- `sessionStore: AcpSessionStore`（必填）
- 可选 `reminderContext: { changeId?: string; stageIndex?: number; runId?: string }`
- 可选钩子 `onReminderInjected: (reminderPart: TextUIPart) => Promise<void>`，其中 `TextUIPart` 由 `ai` 包提供
- 可选 `recoveryContext: Partial<RecoveryContext>`

`AcpSession.start(parts: ChatPromptPart[])` SHALL 仅在 `connection.newSession()` 成功返回后，调用 `resolveSystemReminder({ owner, projectPath, cwd, fylloSessionId, agentId, ...reminderContext })`。若返回非 null 的 `TextUIPart`：

1. 在 `try/catch` 中 `await onReminderInjected(reminderPart)`。任何异常 SHALL 被 `logger.error` 记录，SHALL NOT 上抛，SHALL NOT 中断 stream
2. 无论钩子成功或失败，系统 SHALL 继续把 reminder part 置于 `connection.prompt()` 的 `prompt` 数组首位

所有构造 `AcpSession` 的 IPC handler（`chat.ts`、`proposal-apply.ts`）SHALL 传入正确的 `owner`、`sessionStore`、对应 `reminderContext`、`onReminderInjected`。

#### Scenario: chat IPC handler 构造 AcpSession 时传入 chat owner

- **WHEN** `chat:stream:message` 的 handler 构造 `AcpSession`
- **THEN** `opts.owner` 为 `"chat"`
- **AND** `opts.sessionStore` 为 `ChatAcpSessionStore` 实例
- **AND** `opts.onReminderInjected` 传入对 `<sessionId>.messages.jsonl` 调 `prependReminderToLastUserMessage` 的实现

#### Scenario: proposal-apply stage handler 构造 AcpSession 时传入 apply owner 与 stage 上下文

- **WHEN** `proposal:stageStream` 的 handler 构造 `AcpSession`
- **THEN** `opts.owner` 为 `"apply"`
- **AND** `opts.sessionStore` 为 `ApplyStageAcpSessionStore` 实例
- **AND** `opts.reminderContext` 包含 `{ changeId, stageIndex, runId }`
- **AND** `opts.onReminderInjected` 传入对 `stage-{stageIndex}.messages.jsonl` 的 prepend 实现

#### Scenario: proposal-archive handler 构造 AcpSession 时传入 archive owner

- **WHEN** `proposal:archive` 的 handler 构造 `AcpSession`
- **THEN** `opts.owner` 为 `"archive"`
- **AND** `opts.sessionStore` 为 `ArchiveAcpSessionStore` 实例
- **AND** `opts.reminderContext` 包含 `{ changeId, runId }`（其中 `runId` 为 archive run id）
- **AND** `opts.onReminderInjected` 传入对 `archive.messages.jsonl` 的 prepend 实现

#### Scenario: 钩子异常不中断 prompt 发起

- **WHEN** `onReminderInjected(reminderPart)` 抛出异常
- **THEN** `AcpSession.start` 通过 `logger.error` 记录异常
- **AND** 不再上抛该异常
- **AND** `connection.prompt()` 的 `prompt` 数组仍以 `[reminderPart, ...userBlocks]` 形式发起

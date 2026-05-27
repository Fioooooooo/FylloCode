## ADDED Requirements

### Requirement: AcpSessionOpts 支持 presetAcpSessionId 字段

`electron/main/services/chat/acp-session.ts` 的 `AcpSessionOpts` 接口 SHALL 新增可选字段：

```ts
presetAcpSessionId?: string;
```

语义：

- 当该字段存在时，本次 turn 的 ACP session 已经在外部（例如 SessionProbeService）通过 `connection.newSession` 完成握手，`AcpSession.start` SHALL NOT 再次调用 `connection.newSession`、`connection.resumeSession`、`connection.loadSession`。
- 当该字段存在时，外部调用方 SHALL 在调用 `start(parts)` 之前完成对 SessionMeta 的字段级更新（写入 `acpSessionId`、`agentId`、`config_options`），使 `AcpSessionOpts.sessionStore.loadAcpSessionId()` 在本次调用内能返回该 `acpSessionId`。
- 该字段当且仅当当前 fyllo session 没有任何已持久化历史消息时使用——即首条消息场景。`AcpSession` 不依赖该约束做断言，但调用方 SHALL 遵守。

#### Scenario: presetAcpSessionId 字段在 AcpSessionOpts 上可选可缺省

- **WHEN** 调用方构造 `AcpSession`，不传 `presetAcpSessionId`
- **THEN** TypeScript 编译通过
- **AND** 行为与本次 change 之前完全一致

#### Scenario: presetAcpSessionId 字段被传入

- **WHEN** 调用方构造 `AcpSession({ ..., presetAcpSessionId: "sess-A" })`
- **THEN** `AcpSession` 实例内部记录该值
- **AND** 后续 `start` 调用按下面"AcpSession.start 在 presetAcpSessionId 存在时跳过 newSession 但仍注入 reminder"要求执行

### Requirement: AcpSession.start 在 presetAcpSessionId 存在时跳过 newSession 但仍注入 reminder

`AcpSession.start(parts)` 在 `presetAcpSessionId !== undefined` 时 SHALL：

1. 通过 `await this.opts.sessionStore.loadAcpSessionId()` 读到该 `acpSessionId`（调用方已在调用前写入 SessionMeta）。
2. 走 `tryHandlePersistedSession` 等价路径：直接对该 `acpSessionId` 调 `connection.prompt(...)`。SHALL NOT 调用 `newSession`、`resumeSession`、`loadSession`。
3. **仍然注入 system-reminder**：与现有 `newSession` 分支等价——调用 `resolveSystemReminder({ owner, projectPath, cwd, fylloSessionId, agentId, ...reminderContext })`，若返回非 null `TextUIPart`：
   - 在 `try/catch` 中 `await opts.onReminderInjected(reminderPart)`（异常仅 `logger.error`，不上抛、不中断 stream）
   - 把 reminder block 置于 `connection.prompt` 的 `prompt` 数组首位
4. SHALL 调用 `await this.opts.sessionStore.persistAcpSessionId(acpSessionId)` 完成 `turnCount` 自增等元数据维护，与 `tryHandlePersistedSession` 路径一致。
5. SHALL NOT emit `config_options_update` 事件——configOptions 已由调用方在 SessionMeta 落盘并由 IPC handler 广播给 renderer。

`AcpSession.start` 在 `presetAcpSessionId === undefined` 时 SHALL 保持现有行为（按 `loadAcpSessionId()` 决定 direct prompt / 恢复 / 新建 newSession 路径），并按既定规则决定是否注入 reminder。

direct prompt 在当前 turn 收到任意 `session/update` 之前失败且被归类为 "session missing" 时，preset 分支 SHALL 直接将 turn 报错，SHALL NOT 进入 `recoverSession` 调用 `resumeSession` / `loadSession` / `newSession`。理由：preset 分支的 acpSessionId 来源于刚刚 probe 创建的 session，"session missing" 在该上下文下意味着 agent 端状态异常，自动恢复会掩盖故障；调用方（renderer）可清理 draftProbe 后由用户重新发起。

#### Scenario: presetAcpSessionId 跳过 newSession

- **WHEN** `AcpSession` 实例的 `presetAcpSessionId === "sess-A"`，调用 `start(parts)`
- **THEN** SHALL NOT 调用 `connection.newSession`
- **AND** SHALL NOT 调用 `connection.resumeSession`
- **AND** SHALL NOT 调用 `connection.loadSession`
- **AND** SHALL 直接对 `"sess-A"` 调 `connection.prompt({ sessionId: "sess-A", prompt })`

#### Scenario: presetAcpSessionId 仍注入 system-reminder

- **WHEN** `AcpSession` 实例的 `presetAcpSessionId !== undefined`，且 `resolveSystemReminder(...)` 返回非 null `TextUIPart`
- **THEN** 主进程 `await opts.onReminderInjected(reminderPart)`（异常仅 logger.error）
- **AND** `connection.prompt` 的 `prompt` 数组首位为该 reminder text block
- **AND** 用户原始 parts 紧随其后

#### Scenario: presetAcpSessionId 不发送 config_options_update

- **WHEN** `AcpSession` 实例的 `presetAcpSessionId !== undefined`，调用 `start(parts)`
- **THEN** SHALL NOT emit `{ type: "config_options_update", ... }` 事件
- **AND** turn 中 agent 主动推送的 `sessionUpdate: "config_option_update"` 仍按既有规则透传

#### Scenario: presetAcpSessionId direct prompt 失败时不进入 recovery

- **WHEN** `AcpSession.start` 走 preset 分支，对 `"sess-A"` 的 `connection.prompt` 在尚未收到任何 `session/update` 之前抛出 "session missing" 错误
- **THEN** SHALL 把该 turn 按失败处理（emit `error` 事件）
- **AND** SHALL NOT 调用 `recoverSession`
- **AND** SHALL NOT 调用 `connection.newSession`

## MODIFIED Requirements

### Requirement: chat:stream:message 接受 ChatPromptPart 数组

系统 SHALL 把 `chat:stream:message` IPC 的 `prompt` 字段类型从 `string` 改为 `ChatPromptPart[]`。`shared/types/chat-prompt.ts` SHALL 暴露：

```ts
type ChatPromptPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; uri: string; filename: string }
  | { type: "resource_link"; uri: string; mediaType: string; filename: string };
```

`shared/schemas/ipc/chat.ts` 的 `streamMessageInputSchema.prompt` SHALL 改为 `z.array(chatPromptPartSchema).min(1)`。`chatPromptPartSchema` 为 zod discriminated union，type 字段作为 discriminator。

`streamMessageInputSchema` 同时 SHALL 新增可选字段 `acpSessionId: z.string().min(1).optional()`。语义：当该字段存在时，主进程 handler 视为"renderer 已通过 SessionProbe 完成 ACP newSession 握手，请复用该 acpSessionId 跳过 newSession"。

`chatApi.streamMessage(...)` 的签名 SHALL 改为接受可选的 `acpSessionId`：

```ts
streamMessage(
  sessionId: string,
  projectId: string,
  agentId: string,
  parts: ChatPromptPart[],
  callbacks: StreamCallbacks,
  options?: { acpSessionId?: string }
): () => void
```

preload `electron/preload/api/chat.ts` 同步改造，把 `options.acpSessionId` 透传到 `ipcRenderer.invoke(ChatStreamChannels.streamMessage, ...)` 的 payload。

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

#### Scenario: 携带 acpSessionId 入参合法

- **WHEN** 渲染进程传入 `{ sessionId, projectId, agentId: "claude-code", prompt: [{ type: "text", text: "hi" }], acpSessionId: "sess-A" }`
- **THEN** zod 校验通过
- **AND** 主进程 handler 进入 probe consume 路径（详见 `chat-session-probe` spec）

#### Scenario: 空字符串 acpSessionId 被拒

- **WHEN** 入参 `acpSessionId: ""`
- **THEN** zod 校验失败，返回 `VALIDATION_ERROR`

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
- 可选 `presetAcpSessionId: string`（参见 "AcpSessionOpts 支持 presetAcpSessionId 字段" requirement）

`AcpSession.start(parts: ChatPromptPart[])` SHALL 在以下两种情况注入 system-reminder：

1. 该轮 turn 真正调用了 `connection.newSession()`（既有行为）；
2. 该轮 turn `presetAcpSessionId !== undefined`（新增行为，参见 "AcpSession.start 在 presetAcpSessionId 存在时跳过 newSession 但仍注入 reminder" requirement）。

注入时 SHALL 调用 `resolveSystemReminder({ owner, projectPath, cwd, fylloSessionId, agentId, ...reminderContext })`。若返回非 null 的 `TextUIPart`：

1. 在 `try/catch` 中 `await onReminderInjected(reminderPart)`。任何异常 SHALL 被 `logger.error` 记录，SHALL NOT 上抛，SHALL NOT 中断 stream
2. 无论钩子成功或失败，系统 SHALL 继续把 reminder part 置于 `connection.prompt()` 的 `prompt` 数组首位

`tryHandlePersistedSession` 走 direct prompt 路径（非 preset、由历史 fyllo session 续轮）SHALL NOT 注入 reminder——与现有行为保持一致。

所有构造 `AcpSession` 的 IPC handler（`chat.ts`、`proposal-apply.ts`）SHALL 传入正确的 `owner`、`sessionStore`、对应 `reminderContext`、`onReminderInjected`。`chat.ts` 在 `chat:stream:message` 入参含 `acpSessionId` 时 SHALL 传入 `presetAcpSessionId`，其他场景下 SHALL NOT 传入该字段。

#### Scenario: chat IPC handler 构造 AcpSession 时传入 chat owner

- **WHEN** `chat:stream:message` 的 handler 构造 `AcpSession`
- **THEN** `opts.owner` 为 `"chat"`
- **AND** `opts.sessionStore` 为 `ChatAcpSessionStore` 实例
- **AND** `opts.onReminderInjected` 传入对 `<sessionId>.messages.jsonl` 调 `prependReminderToLastUserMessage` 的实现

#### Scenario: chat IPC handler 在 acpSessionId 入参存在时传入 presetAcpSessionId

- **WHEN** `chat:stream:message` 入参含非空 `acpSessionId`
- **THEN** handler 构造 `AcpSession({ ..., presetAcpSessionId: <入参 acpSessionId> })`
- **AND** SHALL NOT 在不传入参时传入该字段

#### Scenario: proposal-apply stage handler 构造 AcpSession 时传入 apply owner 与 stage 上下文

- **WHEN** `proposal:stageStream` 的 handler 构造 `AcpSession`
- **THEN** `opts.owner` 为 `"apply"`
- **AND** `opts.sessionStore` 为 `ApplyStageAcpSessionStore` 实例
- **AND** `opts.reminderContext` 包含 `{ changeId, stageIndex, runId }`
- **AND** `opts.onReminderInjected` 传入对 `stage-{stageIndex}.messages.jsonl` 的 prepend 实现
- **AND** SHALL NOT 传入 `presetAcpSessionId`

#### Scenario: proposal-archive handler 构造 AcpSession 时传入 archive owner

- **WHEN** `proposal:archive` 的 handler 构造 `AcpSession`
- **THEN** `opts.owner` 为 `"archive"`
- **AND** `opts.sessionStore` 为 `ArchiveAcpSessionStore` 实例
- **AND** `opts.reminderContext` 包含 `{ changeId, runId }`（其中 `runId` 为 archive run id）
- **AND** `opts.onReminderInjected` 传入对 `archive.messages.jsonl` 的 prepend 实现
- **AND** SHALL NOT 传入 `presetAcpSessionId`

#### Scenario: 钩子异常不中断 prompt 发起

- **WHEN** `onReminderInjected(reminderPart)` 抛出异常
- **THEN** `AcpSession.start` 通过 `logger.error` 记录异常
- **AND** 不再上抛该异常
- **AND** `connection.prompt()` 的 `prompt` 数组仍以 `[reminderPart, ...userBlocks]` 形式发起

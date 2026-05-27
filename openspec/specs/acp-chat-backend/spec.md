# acp-chat-backend Specification

## Purpose

ACP agent 进程池管理、session 生命周期、sessionUpdate 映射、session 持久化。

## Requirements

### Requirement: ACP agent 进程池管理（按 agentId 懒启动复用）

系统 SHALL 维护一个 `Map<agentId, AcpAgentProcess>` 进程池（`acp-process-pool.ts`），不在应用启动时预启动任何进程。首次使用某个 `agentId` 时，系统 SHALL 懒启动对应子进程并通过 `ClientSideConnection.initialize` 完成握手；后续同 `agentId` 的请求复用同一连接。进程退出时 SHALL 自动重启并重新握手。

ACP agent 子进程在 POSIX 平台（macOS / Linux）SHALL 以独立 process group leader 形式启动，使主进程在退出阶段可以按 process group 一次性回收 ACP agent 自身及其派生的所有 MCP 孙进程。Windows 平台 SHALL NOT 设置 `detached`，进程组语义改由 `taskkill /T` 在退出阶段处理。

#### Scenario: 首次使用某 agentId 时懒启动进程

- **WHEN** `getOrStartProcess(agentId)` 被调用，且该 `agentId` 尚无运行中的进程
- **THEN** 系统从 `AcpInstalledRecord` 读取 `installMethod`，按以下规则组装 spawn 命令：
  - `npx`：`spawn("npx", ["--no-install", distribution.npx.package, ...(distribution.npx.args ?? [])])`
  - `uvx`：`spawn("uvx", [distribution.uvx.package, ...(distribution.uvx.args ?? [])])`
  - `binary`：`spawn(installPath, [])` （`installPath` 来自 `installed.json` 中的记录，指向 `getDataSubPath('acp')/bin/<agent-id>/` 下的可执行文件）
- **AND** 所有方式均使用 `stdio: ["pipe", "pipe", "pipe"]`
- **AND** 在 POSIX 平台（`process.platform !== "win32"`）的 spawn options 中携带 `detached: true`，使 child 通过 `setsid()` 成为独立 process group leader（pgid === child.pid）
- **AND** 在 Windows 平台 SHALL NOT 设置 `detached: true`，避免 child 被切到独立 console 窗口
- **AND** SHALL NOT 调用 `child.unref()`，使 Node 主进程在 `before-quit` 钩子完成前仍持有该 child 引用
- **AND** spawn 后通过 `ClientSideConnection.initialize` 完成握手
- **AND** 将连接实例存入进程池，供后续同 `agentId` 的请求复用

#### Scenario: 同 agentId 复用已有进程

- **WHEN** `getOrStartProcess(agentId)` 被调用，且该 `agentId` 已有运行中的进程
- **THEN** 直接返回已有的 `ClientSideConnection`，不重新 spawn

#### Scenario: ACP agent 进程意外退出后自动重启

- **WHEN** 某 `agentId` 对应的子进程意外退出，且当前 pool 未处于 shuttingDown 状态
- **THEN** 系统重新 spawn 该子进程并完成 `initialize` 握手
- **AND** 重启期间收到的 `streamMessage` 请求 SHALL 返回 `{ type: "error", data: { code: "ACP_NOT_READY" } }`

### Requirement: 权限请求自动允许（allow_once）

系统 SHALL 在 ACP agent 发起 `requestPermission` 时，自动选择 `allow_once` 选项（若存在），无需用户交互。

#### Scenario: 工具调用权限请求

- **WHEN** ACP agent 通过 `requestPermission` 请求工具调用权限
- **AND** options 中存在 `kind === "allow_once"` 的选项
- **THEN** 系统自动返回 `{ outcome: { outcome: "selected", optionId: allowOption.optionId } }`

#### Scenario: 无 allow_once 选项时取消

- **WHEN** ACP agent 发起 `requestPermission`
- **AND** options 中不存在 `kind === "allow_once"` 的选项
- **THEN** 系统返回 `{ outcome: { outcome: "cancelled" } }`

### Requirement: ACP session 生命周期管理

系统 SHALL 在每次 `streamMessage` 时，将“FylloCode 持久化的 `acpSessionId`”视为恢复线索，而不是“当前 agent 进程内 session 一定还活着”的证明。`acpSessionId` 的读取与持久化 SHALL 通过 `AcpSessionOpts.sessionStore`（`AcpSessionStore` 接口）完成，`AcpSession` 模块自身 SHALL NOT 引用 `electron/main/infra/storage/session-store.ts`。

当不存在持久化的 `acpSessionId` 时（`sessionStore.loadAcpSessionId()` 返回 `null`），系统 SHALL 调用 `connection.newSession()` 创建真实 ACP session；当存在持久化 `acpSessionId` 时，系统 SHALL 先尝试直接对该 `sessionId` 调用 `connection.prompt()` 发起当前 turn，而不是默认先调用 `resumeSession` 或 `loadSession`。

若 direct prompt 在当前 turn 尚未收到任何 ACP `session/update` 事件之前失败，且失败被 FylloCode 归类为“session missing”错误，系统 SHALL 进入恢复流。系统 SHALL 优先依据 agent 在 `initialize` 握手中声明的能力决定恢复顺序，而不是写死某一个 ACP adapter 的行为：

- 若 agent 声明 `session.resume` capability，则 SHALL 先尝试 `connection.resumeSession({ sessionId, cwd, mcpServers })`
- 若 `resumeSession` 不受支持，或其结果仍被归类为“session missing”，且 agent 声明 `loadSession: true` capability，则 SHALL 再尝试 `connection.loadSession({ sessionId, cwd, mcpServers })`
- 若 ACP-native 恢复均不可用或失败，则 SHALL 退化为 `connection.newSession()`，并使用 FylloCode 本地持久化的历史消息对上下文做 best-effort 重建后，再发送当前用户消息

系统 SHALL 将以下两类信号视为“session missing”判定依据：

- 优先使用结构化错误信号（例如 ACP `resource_not_found` / `-32002`）
- 若 adapter 未提供统一结构化错误，则使用 FylloCode 维护的已知缺失-session 文案签名集合（例如 `Session not found`、`No conversation found with session ID`）对 `message` / `data.details` 做匹配

系统 SHALL NOT 因任意 prompt 错误自动进入恢复流。若当前 turn 已经收到任意 ACP `session/update` 事件，或错误未被归类为“session missing”，系统 SHALL 直接按当前 turn 失败处理，不再自动重试，以避免重复的 tool side effects 或重复输出。

`newSession`、`resumeSession`、`loadSession` 所需的 `mcpServers` 参数 SHALL 统一由 `@main/infra/mcp/bundled-mcp-servers#getBundledMcpServers({ projectPath })` 计算得出，而非硬编码空数组或在 `services/chat/acp-session.ts` 内部拼装。虽然 ACP 协议中 `ResumeSessionRequest.mcpServers` 为 optional，但只要执行 `resumeSession`，系统 SHALL 显式传入该参数；执行 `loadSession` 时 SHALL 同样传入该参数。

当 `AcpSession.start` 本次调用真正执行了 `connection.newSession()`（包括首次创建与所有恢复失败后的 fresh-session fallback）时，系统 SHALL 在 `newSession` 成功返回后、调用 `connection.prompt()` 之前尝试注入 system-reminder：调用 `resolveSystemReminder({ owner, projectPath, cwd, fylloSessionId, agentId, ...opts.reminderContext })`，若返回非 null 的 `TextUIPart`，在 `try/catch` 中 `await opts.onReminderInjected(reminderPart)`（捕获任何异常仅 `logger.error` 记录、不上抛、不中断 stream），再把 reminder block 插入 `connection.prompt` 的 `prompt` 数组首位。`resumeSession` 与 `loadSession` 成功分支 SHALL NOT 注入 reminder。

当恢复流选择 `loadSession`，且 FylloCode 对该 owner/session 已拥有本地持久化历史消息时，agent 通过 `session/update` 回放的历史消息 SHALL 被视为“恢复控制面副作用”，而不是新的 UI 消息来源。系统 SHALL 抑制这些 replay 事件的消息流落盘与 UI 组装，避免重复消息；但 `available_commands_update`、`session_info_update` 等 session 级元数据更新 SHALL 继续生效。

若最终退化为 `newSession + 本地历史重建`，系统 SHALL 将其定义为 best-effort 恢复：使用本地持久化历史消息和当前用户输入重建上下文，但 SHALL NOT 声称该路径能无损还原 ACP adapter 的内部 session state。

该 fresh-session fallback 的 prompt 结构 SHALL 为：

1. 现有 `newSession` 分支生成的 `reminderPart`
2. 一条额外的历史转录 `system-reminder`，内容以纯文本形式包裹在 `<system-reminder> ... </system-reminder>` 中，并至少包含一条“请根据以下对话历史，继续与用户进行对话”的引导语以及提取出的 `assistant:` / `user:` 历史转录
3. 当前用户的真实文本消息

这两条 `system-reminder` 都 MAY 被持久化到 FylloCode 本地消息文件；前端由于已屏蔽 `system-reminder` 的 UI 展示，SHALL NOT 将它们作为用户可见消息展示出来。

`AcpSession.cancel()` SHALL 是幂等的，并且 SHALL 在 `acpSessionId` 尚未解析时也记录取消意图。若当前 turn 在 ACP 连接、session 创建/恢复或 prompt 发起之前被取消，`AcpSession.start` SHALL 在后续 setup await 完成后检查取消状态，并 SHALL NOT 为该 turn 调用 `connection.prompt(...)`。若取消后才解析出 `acpSessionId`，系统 MAY 尝试调用 `connection.cancel({ sessionId: acpSessionId })` 做 best-effort 清理，但 SHALL NOT 因取消清理失败而把该 turn 恢复为活跃流。

#### Scenario: 首次发送消息创建新 ACP session

- **WHEN** IPC handler 收到 `chat:stream:message`，且该 `sessionId` 没有持久化的 `acpSessionId`（`sessionStore.loadAcpSessionId()` 返回 `null`）
- **THEN** 调用 `connection.newSession({ cwd, mcpServers })`，其中 `mcpServers` 为 `getBundledMcpServers({ projectPath })` 的返回值
- **AND** 在正常启用内置 MCP 的场景下，`mcpServers` 至少包含一个 `name === "fyllo-specs"` 的 spec
- **AND** `newSession` 返回后立即调用 `await sessionStore.persistAcpSessionId(acpSessionId)` 持久化
- **AND** emit `{ type: "session_id_resolved", acpSessionId }` 事件
- **AND** 调用 `resolveSystemReminder(...)`；若返回非 null 的 `TextUIPart`，在 `try/catch` 中 `await onReminderInjected(reminderPart)`（异常仅 `logger.error`、不上抛），再把 reminder part 放到 `connection.prompt()` 的 `prompt` 数组首位

#### Scenario: 持久化 ACP session 仍然存活时 direct prompt 成功

- **WHEN** IPC handler 收到 `chat:stream:message`，且 `sessionStore.loadAcpSessionId()` 返回非空的 `acpSessionId`
- **AND** 当前 agent 进程仍持有该 `acpSessionId` 对应的 live session
- **THEN** 系统 SHALL 直接调用 `connection.prompt({ sessionId: acpSessionId, prompt })`
- **AND** SHALL NOT 先调用 `resumeSession` 或 `loadSession`
- **AND** SHALL NOT 注入 system-reminder
- **AND** SHALL 调用 `await sessionStore.persistAcpSessionId(acpSessionId)` 完成元数据维护

#### Scenario: Direct prompt 因 session missing 失败后按 capability 进入恢复流

- **WHEN** IPC handler 收到 `chat:stream:message`，且 `sessionStore.loadAcpSessionId()` 返回非空的 `acpSessionId`
- **AND** 对 `connection.prompt({ sessionId: acpSessionId, prompt })` 的调用在当前 turn 尚未收到任何 `session/update` 事件之前失败
- **AND** 该失败被 FylloCode 归类为“session missing”
- **THEN** 系统 SHALL 根据 agent initialize 时声明的 capabilities 选择恢复路径
- **AND** 若 agent 支持 `session.resume`，则先调用 `connection.resumeSession({ sessionId: acpSessionId, cwd, mcpServers })`
- **AND** 若 `resumeSession` 不支持或仍以“session missing”失败，且 agent 支持 `loadSession`，则调用 `connection.loadSession({ sessionId: acpSessionId, cwd, mcpServers })`
- **AND** 任一恢复成功后，系统 SHALL 调用 `await sessionStore.persistAcpSessionId(recoveredSessionId)`，再仅对“当前这次用户输入”重新发起一次 `connection.prompt()`

#### Scenario: Direct prompt 失败但不满足自动恢复条件

- **WHEN** 对持久化 `acpSessionId` 的 direct prompt 调用失败
- **AND** 当前 turn 已收到至少一个 `session/update` 事件，或该错误未被归类为“session missing”
- **THEN** 系统 SHALL 将该 turn 按正常失败处理
- **AND** SHALL NOT 自动调用 `resumeSession`
- **AND** SHALL NOT 自动调用 `loadSession`
- **AND** SHALL NOT 自动创建新的 ACP session

#### Scenario: 恢复流使用 loadSession 时抑制历史 replay

- **WHEN** 系统因 session missing 进入恢复流
- **AND** 所选恢复方法为 `connection.loadSession({ sessionId, cwd, mcpServers })`
- **AND** FylloCode 对该 owner/session 已存在本地持久化历史消息
- **THEN** agent 通过 `session/update` 回放的历史消息 SHALL NOT 被追加到 UIMessage 列表
- **AND** SHALL NOT 被写回 `sessions/*.messages.jsonl`、`stage-*.messages.jsonl` 或 `archive.messages.jsonl`
- **AND** `available_commands_update` 与 `session_info_update` 等 session 级元数据更新 SHALL 继续生效
- **AND** `loadSession` 完成后，系统才对当前用户输入发起新的 `connection.prompt()`

#### Scenario: Agent 不支持 resumeSession 时直接使用 loadSession

- **WHEN** 系统因 session missing 进入恢复流
- **AND** agent initialize 时未声明 `session.resume` capability
- **AND** agent 声明 `loadSession: true`
- **THEN** 系统 SHALL NOT 调用 `resumeSession`
- **AND** SHALL 直接调用 `connection.loadSession({ sessionId, cwd, mcpServers })`

#### Scenario: ACP-native 恢复全部失败后执行本地历史伪恢复

- **WHEN** 系统因 session missing 进入恢复流
- **AND** `resumeSession`（若支持）与 `loadSession`（若支持）均不可用或失败
- **THEN** 系统 SHALL 调用 `connection.newSession({ cwd, mcpServers })` 创建新的 ACP session
- **AND** SHALL 立即调用 `await sessionStore.persistAcpSessionId(newAcpSessionId)`
- **AND** SHALL 先按 newSession 分支规则生成并注入原有 `reminderPart`
- **AND** SHALL 再基于 FylloCode 本地持久化的历史消息构造一条额外的历史转录 `system-reminder`
- **AND** 该历史转录 `system-reminder` 的文本体 SHALL 用 `<system-reminder> ... </system-reminder>` 包裹，并包含提取出的 `assistant:` / `user:` 对话历史
- **AND** 在两条 `system-reminder` 之后，系统才发送当前用户输入
- **AND** SHALL 仅将该路径视为上下文重建，而非无损恢复原 ACP session
- **AND** 两条 `system-reminder` 都 MAY 被持久化到本地消息文件
- **AND** 前端 SHALL NOT 将这两条 `system-reminder` 作为可见历史消息展示给用户

#### Scenario: 取消流式传输

- **WHEN** IPC handler 收到 `chat:stream:cancel`，包含 `{ sessionId }`
- **THEN** 系统调用当前 chat turn 的 cancel 逻辑
- **AND** 若当前 turn 已经解析出 `acpSessionId`，则调用 `connection.cancel({ sessionId: acpSessionId })` 取消当前 prompt
- **AND** 若当前 turn 尚未解析出 `acpSessionId`，则记录取消意图，使后续 setup 不再发起 prompt

#### Scenario: setup 期取消后不再发起 prompt

- **WHEN** `AcpSession.start` 正在获取 ACP 进程、创建新 ACP session、或恢复 ACP session
- **AND** 用户点击 stop 触发 `AcpSession.cancel()`
- **THEN** `AcpSession.cancel()` 记录取消意图
- **AND** setup 完成后该 turn 不调用 `connection.prompt(...)`
- **AND** 该 turn 不再向 renderer 发送 assistant chunk

#### Scenario: 禁用内置 MCP 环境变量在所有恢复路径生效

- **WHEN** 主进程启动前环境变量 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **AND** IPC handler 收到 `chat:stream:message`，无论最终走 `newSession`、`resumeSession` 还是 `loadSession`
- **THEN** 对应调用的 `mcpServers` 为空数组
- **AND** session 恢复流程其余行为保持不变

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

### Requirement: ACP sessionUpdate 映射为 SessionEvent

系统 SHALL 将 ACP `session/update` notification 映射为 `SessionEvent` 联合类型，通过 MessagePort 推送给渲染进程。

ACP 的 tool call 是独立的一等公民事件（不依附于某条 assistant message），因此不使用旧的 `message_upsert`/`message_patch` 模式，改为直接映射 ACP tool call 语义的新事件类型。

ACP `agent_thought_chunk` 与 `agent_message_chunk` 语义对称（同为 `ContentChunk`），区别仅在前者代表 agent 的思考过程（reasoning），后者代表用户可见输出（text）；两者分别映射到独立的 `SessionEvent` 成员。

ACP `available_commands_update` 是 session 级 slash 命令声明（`{ availableCommands: AvailableCommand[] }`），与单条消息流动无关，映射为独立 `SessionEvent` 成员，不进入 `MessageAssembler` 的消息组装通路。

**`SessionEvent` 联合类型定义（替换旧定义）：**

```typescript
type AcpAvailableCommand = {
  name: string;
  description: string;
  hint?: string;
};

type SessionEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call_start"; toolCallId: string; title: string; kind: string }
  | {
      type: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | {
      type: "usage_update";
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | { type: "session_info_update"; title: string }
  | { type: "available_commands_update"; commands: AcpAvailableCommand[] }
  | { type: "done"; totalTokens: number }
  | { type: "error"; code: string; message: string }
  | { type: "session_id_resolved"; acpSessionId: string };
```

#### Scenario: 文本流式输出

- **WHEN** ACP 推送 `sessionUpdate === "agent_message_chunk"` 且 `content.type === "text"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "text_delta", text } }`

#### Scenario: 思考片段流式输出

- **WHEN** ACP 推送 `sessionUpdate === "agent_thought_chunk"` 且 `content.type === "text"`
- **THEN** `acp-mapper` 产出 `SessionEvent { type: "reasoning_delta", text }`
- **AND** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "reasoning_delta", text } }`

#### Scenario: 思考片段非文本内容忽略

- **WHEN** ACP 推送 `sessionUpdate === "agent_thought_chunk"` 且 `content.type !== "text"`
- **THEN** `acp-mapper` 返回 `null`（与 `agent_message_chunk` 非文本分支一致），不产生任何下游 chunk

#### Scenario: 工具调用开始

- **WHEN** ACP 推送 `sessionUpdate === "tool_call"` 且 `status === "pending"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "tool_call_start", toolCallId, title, toolKind } }`

#### Scenario: 工具调用进度或完成

- **WHEN** ACP 推送 `sessionUpdate === "tool_call_update"`，`status` 为 `"in_progress"`、`"completed"` 或 `"failed"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "tool_call_update", toolCallId, status, input, content } }`
- **AND** `content` 为 `tool_call_update.content` 中所有 text 类型 ContentBlock 的拼合文本（无 content 时为 `undefined`）

#### Scenario: usage_update 实时推送

- **WHEN** ACP 推送 `sessionUpdate === "usage_update"`
- **THEN** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "usage_update", used, size, cost } }`
- **AND** `used`、`size`、`cost` 直接透传 ACP 推送的原始值

#### Scenario: session_info_update 推送

- **WHEN** ACP 推送 `sessionUpdate === "session_info_update"` 且 `title` 为非空字符串
- **THEN** `acp-mapper` 产出 `SessionEvent { type: "session_info_update", title }`

#### Scenario: 可用命令列表推送

- **WHEN** ACP 推送 `sessionUpdate === "available_commands_update"`，携带 `availableCommands` 数组
- **THEN** `acp-mapper` 遍历 `availableCommands`，对每条命令仅取 `name`（string，必填）、`description`（string，必填）以及 `input.hint`（当 `input != null && input.type === "unstructured"` 且 `input.hint` 为字符串时取之，否则 `hint` 为 `undefined`）
- **AND** 丢弃 `_meta` 与其他未识别字段
- **AND** 产出 `SessionEvent { type: "available_commands_update", commands: AcpAvailableCommand[] }`
- **AND** 即使 `availableCommands` 为空数组，仍产出事件（用于告知下游"agent 明确声明无可用命令"）

#### Scenario: prompt 完成

- **WHEN** `connection.prompt` 返回（`stopReason` 为 `"end_turn"` 或其他终止原因）
- **THEN** 通过 MessagePort 发送 `{ type: "done", data: { totalTokens } }`
- **AND** 关闭 port1

#### Scenario: ACP 通信异常

- **WHEN** `connection.prompt` 抛出异常或 ACP 进程不可用
- **THEN** 通过 MessagePort 发送 `{ type: "error", data: { code: "ACP_ERROR", message } }`
- **AND** 关闭 port1

#### Scenario: 未识别 sessionUpdate 类型

- **WHEN** ACP 推送其他未识别的 `sessionUpdate` 类型（例如 `plan`、`user_message_chunk`、`current_mode_update` 等协议将来扩展的类型）
- **THEN** `acp-mapper` 在 default 分支记录 debug 日志，返回 `null`，不产生任何下游 chunk

### Requirement: 前端 chat store 从流式事件组装 assistant UIMessage

前端 chat store SHALL 在流式过程中实时组装 `role: "assistant"` 的 `UIMessage`，不等待 prompt 完成。ACP 没有"assistant message"的概念，text chunk、reasoning chunk 和 tool call 均为独立事件，store 通过 `useUIMessageAssembler` 将它们归并到同一条 assistant message 的 `parts` 数组中。

**组装规则：**

- 收到第一个 `text_delta` 时，若当前无活跃 assistant message，则创建一条新的 `UIMessage`（生成临时 id），追加到 `session.messages`，并记录为 `activeAssistantId`
- 后续 `text_delta` 追加到 `activeAssistantId` 对应消息的 text part；若当前 part 不是 text part（如刚结束一段 reasoning 或 tool），新建 text part 并更新 `activeTextPartIdx`
- 收到 `reasoning_delta` 时，与 text 轨道对称处理：若当前无活跃 assistant message，先创建一条；维护独立的 `activeReasoningPartIdx`，连续 reasoning delta 合并到同一 `{ type: "reasoning", text }` part；任意 `reasoning_delta` 到达时重置 `activeTextPartIdx`（并反向亦然）
- 收到 `tool_call_start` 时，向 `activeAssistantId` 对应消息追加一个 `dynamic-tool` part（`state: "input-available"`，携带 `toolCallId`、`toolName: title`、`input: {}`）；若当前无活跃 assistant message，先创建一条；同时重置 `activeTextPartIdx` 与 `activeReasoningPartIdx`
- 收到 `tool_call_update`（completed/failed）时，找到对应 `toolCallId` 的 `dynamic-tool` part，更新 `state` 为 `"output-available"`，写入 `output: content`
- 收到 `usage_update` 时，更新 `activeSession.tokenUsage`
- 收到 `available_commands_update` 时，**不触碰消息容器**，调用 `useSessionStore().setSessionAvailableCommands(activeSession.id, commands)` 写入会话级字段
- 收到 `done` 时，清空 `activeAssistantId`、`activeTextPartIdx`、`activeReasoningPartIdx`

**`MessageChunkData` 类型（替换旧定义）：**

```typescript
type MessageChunkData =
  | { kind: "text_delta"; text: string }
  | { kind: "reasoning_delta"; text: string }
  | { kind: "tool_call_start"; toolCallId: string; title: string; toolKind: string }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | {
      kind: "usage_update";
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | { kind: "session_info_update"; title: string }
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "available_commands_update"; commands: AcpAvailableCommand[] }
  | { kind: "status"; agentStatus: ChatStatus };
```

#### Scenario: 纯文本回复的流式渲染

- **WHEN** 流式过程中连续收到多个 `text_delta`
- **THEN** store 创建一条 assistant UIMessage，每个 delta 追加到其 text part，UI 实时更新

#### Scenario: 纯 reasoning 回复的流式渲染

- **WHEN** 流式过程中连续收到多个 `reasoning_delta`
- **THEN** store 创建一条 assistant UIMessage，每个 delta 追加到同一 `{ type: "reasoning", text }` part，UI 实时在 `UChatReasoning` 折叠区域中渲染

#### Scenario: reasoning 与 text 交替

- **WHEN** 同一轮回复中 `reasoning_delta` 与 `text_delta` 交替到达
- **THEN** 所有内容归并到同一条 assistant UIMessage 的 `parts` 数组；reasoning part 与 text part 各自独立延续，互相重置活跃 idx，不跨类型合并

#### Scenario: 含工具调用的回复

- **WHEN** 流式过程中收到 `tool_call_start`，随后收到 `tool_call_update`（completed）
- **THEN** store 向当前 assistant message 追加 `dynamic-tool` part，初始 `state: "input-available"`
- **AND** 收到 completed 后更新该 part 的 `state` 为 `"output-available"`，写入 `output`
- **AND** `tool_call_start` 触发时同时重置 text 与 reasoning 的 active idx

#### Scenario: 文本与工具调用交替出现

- **WHEN** 同一轮回复中 `text_delta` 和 `tool_call_start` 交替到达
- **THEN** 所有内容归并到同一条 assistant UIMessage 的 `parts` 数组，顺序与到达顺序一致

#### Scenario: 流式过程中实时更新 token 用量

- **WHEN** 前端收到 `usage_update` chunk，携带 `used` 和 `size`
- **THEN** chat store 更新 `activeSession.tokenUsage.used` 为 `used`
- **AND** 更新 `activeSession.tokenUsage.size` 为 `size`
- **AND** 若 chunk 包含 `cost`，更新 `activeSession.tokenUsage.cost` 为 `cost`
- **AND** UI 环形进度条实时反映新百分比

#### Scenario: 流式完成后保持 token 用量

- **WHEN** 前端收到 `done` 事件
- **THEN** chat store 不清空 `tokenUsage`，保持当前累计值供后续轮次继续累加

#### Scenario: 流式收到 available_commands_update

- **WHEN** 前端 chat store 在 `streamSessionMessage.onChunk` 中收到 `{ kind: "available_commands_update", commands }`
- **THEN** 不经过 `useUIMessageAssembler`，不修改 `activeSession.messages`
- **AND** 调用 `useSessionStore().setSessionAvailableCommands(activeSession.id, commands)`，将 commands 覆盖到 session 的内存态字段
- **AND** `commands` 为空数组时也会原样覆盖，使 UI 可据此判定"agent 明确声明无命令"

### Requirement: Main 进程在 chat stream done 时组装并持久化 assistant UIMessage

系统 SHALL 在 `chat:stream:message` 的主进程 handler 中维护 `MessageAssembler` 实例（来自 `@main/services/chat/message-assembler`），在 `text_delta` / `reasoning_delta` / `tool_call_start` / `tool_call_update` 事件上调用 `assembler.apply(ev)`，并在收到 `done` 事件时先执行 `assembler.flush()`，将返回的 `UIMessage<MessageMeta>` 通过 `appendMessage` 写入 `sessions/<sessionId>.messages.jsonl`，随后再通过 sink 发送 `done` chunk。落盘失败 SHALL 通过 sink 以 `ACP_ERROR` 归一化抛错，不阻塞 session 注销。

`MessageAssembler.flush()` 产生的 `UIMessage.id` 由主进程自行 `generateId()` 生成，与渲染进程活跃期间使用的临时 id 独立。

`MessageAssembler` 维护三个 active idx：`activeTextPartIdx` / `activeReasoningPartIdx` / （tool 由 `toolCallId` 直接索引，无独立 idx）。reasoning 轨道与 text 轨道互相重置，tool_call_start 同时重置两者。reasoning part 结构为 `{ type: "reasoning", text: string }`，与 AI SDK `ReasoningUIPart` 一致。

#### Scenario: usage_update 透传并实时持久化

- **WHEN** `chat:stream:message` 的 `AcpSession` emit `usage_update` 事件
- **THEN** 主进程直接通过 sink 发送 `{ type: "chunk", data: { kind: "usage_update", used, size, cost } }`
- **AND** 不经过 `MessageAssembler`
- **AND** 立即更新 session 元数据的 `tokenUsage` 为 `{ used, size, cost }` 并调用 `saveSessionMeta` 持久化到磁盘
- **AND** 当 `cost` 不存在时，`tokenUsage.cost` SHALL 保持为 `undefined`

#### Scenario: available_commands_update 透传并持久化

- **WHEN** `chat:stream:message` 的 `AcpSession` emit `available_commands_update` 事件
- **THEN** 主进程直接通过 sink 发送 `{ type: "chunk", data: { kind: "available_commands_update", commands } }`
- **AND** 不经过 `MessageAssembler`
- **AND** 主进程将 `commands` 覆盖写入当前 session meta 的 `available_commands` 字段并调用 `saveSessionMeta` 持久化到磁盘
- **AND** `commands` 为空数组时仍然透传并持久化为空数组
- **AND** 持久化失败 SHALL 记录日志但 SHALL NOT 阻断本次流式响应

#### Scenario: reasoning_delta 进入 MessageAssembler 并透传

- **WHEN** `chat:stream:message` 的 `AcpSession` emit `reasoning_delta` 事件
- **THEN** 主进程调用 `assembler.apply(ev)`，assembler 按 reasoning 轨道规则合并到当前 assistant message 的 `{ type: "reasoning", text }` part
- **AND** 主进程通过 sink 发送 `{ type: "chunk", data: { kind: "reasoning_delta", text } }`

#### Scenario: Stage 正常完成时主进程组装并落盘 assistant 消息

- **WHEN** `chat:stream:message` 的 `AcpSession` emit `done` 事件
- **THEN** 主进程调用 `assembler.flush()` 得到完整 `UIMessage<MessageMeta>`
- **AND** 通过 `appendMessage(projectPath, sessionId, message)` 将该消息写入磁盘
- **AND** 通过 sink 发送 `{ type: "done", data: { totalTokens } }`
- **AND** 更新 session 元数据的 `tokenUsage.used` 字段（累加 `totalTokens`）
- **AND** 保留 session 元数据中已有的 `tokenUsage.cost`
- **AND** 保留 session 元数据中已有的 `available_commands`
- **AND** 从 `sessionRegistry` 注销对应的 `chat` session

#### Scenario: 渲染进程在流中途关闭仍完成 assistant 落盘

- **WHEN** 渲染进程在 chat stream 进行中关闭 MessagePort
- **THEN** 主进程的 `AcpSession` 继续运行
- **AND** `MessageAssembler` 继续累积事件（包括 reasoning_delta）
- **AND** `available_commands_update` 仍会写入当前 session meta 的 `available_commands`
- **AND** `done` 到达时 assistant 消息正常写入 `sessions/<sessionId>.messages.jsonl`，包含 reasoning part

#### Scenario: Assistant 消息落盘失败

- **WHEN** `appendMessage` 抛出异常
- **THEN** 主进程通过 sink 发送 `{ type: "error", data: { code: "ACP_ERROR", message } }`
- **AND** 从 `sessionRegistry` 注销对应的 `chat` session

### Requirement: `chat:persistMessage` 仅用于 user message

`chat:persistMessage` IPC 的入参校验 SHALL 约束 `message.role === "user"`。非 `"user"` 的请求 SHALL 返回 `VALIDATION_ERROR`。

渲染进程 SHALL 在 `sendMessage` 时，于 `queueUserMessage` 之后调用 `chat:persistMessage` 落盘 user 消息。assistant 消息的持久化 SHALL 由主进程在 `chat:stream:message` 的 `done` 事件内完成，渲染进程 SHALL NOT 在 `onDone` 内调用 `chat:persistMessage` 落盘 assistant。

#### Scenario: 渲染进程发送 user 消息

- **WHEN** 用户点击发送
- **THEN** 渲染进程创建 user UIMessage，push 到 `session.messages`
- **AND** 调用 `chat:persistMessage(sessionId, projectId, userMessage)` 触发落盘

#### Scenario: `persistMessage` 拒绝 assistant 消息

- **WHEN** 渲染进程调用 `chat:persistMessage` 传入 `role !== "user"` 的消息
- **THEN** 主进程返回 `VALIDATION_ERROR`

### Requirement: Session 信息持久化

系统 SHALL 将每个 session 的元数据（含 `acpSessionId`、`agentId`、可选 `available_commands`）持久化到 `getDataSubPath('sessions')/<sessionId>.json`，支持应用重启后恢复 ACP session 上下文和 session 级可用命令列表。所有 `acpSessionId`、`turnCount`、`title`、`tokenUsage`、`available_commands` 等 session meta 变更 SHALL 通过 `electron/main/infra/storage/session-store.ts` 提供的统一 API 完成；主进程其他模块 MUST NOT 自行执行 `load -> merge -> save` 的整对象回写。

#### Scenario: 首次创建 session 时写入持久化文件

- **WHEN** 新 ACP session 创建成功
- **THEN** 系统在 `getDataSubPath('projects')/<encodeProjectPath(project.path)>/sessions/<sessionId>.json` 写入 `{ sessionId, acpSessionId, agentId, title, turnCount, tokenUsage, createdAt, updatedAt }`
- **AND** `available_commands` 初始缺失
- **AND** `tokenUsage` 初始化为 `{ used: 0, size: 0 }`
- **AND** `tokenUsage.cost` 初始为 `undefined`
- **AND** `encodeProjectPath` 实现为：去掉路径开头的 `/`，将所有 `/` 替换为 `-`

#### Scenario: 存在持久化文件时恢复 ACP session 上下文

- **WHEN** IPC handler 收到 `chat:stream:message`，且 `getDataSubPath('projects')/<encodeProjectPath(project.path)>/sessions/<sessionId>.json` 存在
- **THEN** 读取文件中的 `acpSessionId` 用于 `resumeSession`
- **AND** 若文件包含 `available_commands`，主进程在构建 `Session` 返回值时将其映射为 `availableCommands`

#### Scenario: available_commands 持久化格式

- **WHEN** 主进程保存 session meta 且当前 session 已收到 commands
- **THEN** session meta JSON 使用 key `available_commands`
- **AND** 其值为 `AcpAvailableCommand[]`
- **AND** 不使用 `availableCommands` 作为落盘 key

#### Scenario: 第二轮对话启动不覆盖已有 available_commands

- **WHEN** 某 session 已在历史 turn 中持久化 `available_commands`
- **AND** 后续一次 `AcpSession.start()` 因 `newSession`、`resumeSession` 或其回退分支而更新 `acpSessionId`、`turnCount`、`updatedAt`
- **THEN** 本次写入通过 session-store 的字段级更新完成
- **AND** session meta 中既有的 `available_commands` SHALL 保持不变，除非本 turn 收到新的 `available_commands_update`

### Requirement: listSessions IPC 从磁盘返回项目 session 列表

系统 SHALL 实现 `chat:listSessions` IPC handler，从磁盘读取指定项目的所有 session 元数据，按 `updatedAt` 降序返回，`messages` 字段为空数组。

#### Scenario: 列出项目 sessions

- **WHEN** 渲染进程调用 `chat:listSessions` 并传入 `{ projectId }`
- **THEN** 主进程通过 `projectId` 解析 `projectPath`，调用 `listSessionMetas(projectPath)`，返回按 `updatedAt` 降序排列的 `Session[]`，每个 session 的 `messages` 为空数组

#### Scenario: 项目无 session 时返回空数组

- **WHEN** 渲染进程调用 `chat:listSessions`，且该项目无任何 session 文件
- **THEN** 返回空数组 `[]`

### Requirement: createSession IPC 创建并持久化 session 元数据

系统 SHALL 实现 `chat:createSession` IPC handler，生成新的 `sessionId`，写入 session 元数据文件，返回 `Session` 对象。

#### Scenario: 创建新 session

- **WHEN** 渲染进程调用 `chat:createSession` 并传入 `{ projectId, title, agentId }`
- **THEN** 主进程生成 `sessionId`（格式：`session-<timestamp>`），调用 `saveSessionMeta` 写入磁盘（含 `agentId`），返回对应的 `Session` 对象（`messages: []`，`status: "ended"`，`turnCount: 0`，`agentId`）

#### Scenario: 草稿态首条消息前创建 session

- **WHEN** 渲染进程在草稿态发送第一条消息前调用 `chat:createSession`
- **THEN** 调用方传入的 `title` 为基于首条用户消息生成的兜底标题
- **AND** 返回的 `sessionId` 作为该轮首条消息持久化与后续流式会话的唯一 session 标识

### Requirement: updateSession IPC 更新 session 元数据

系统 SHALL 实现 `chat:updateSession` IPC handler，读取现有元数据、合并 patch、写回磁盘。

#### Scenario: 更新 session 标题

- **WHEN** 渲染进程调用 `chat:updateSession` 并传入 `{ id, patch: { title }, projectId }`
- **THEN** 主进程读取现有 meta，合并 patch，更新 `updatedAt`，写回磁盘，返回更新后的 `Session`

### Requirement: removeSession IPC 删除 session 文件

系统 SHALL 实现 `chat:removeSession` IPC handler，删除 session 的元数据文件、消息文件，以及 session 关联的所有附件文件。

#### Scenario: 删除 session

- **WHEN** 渲染进程调用 `chat:removeSession` 并传入 `{ id, projectId }`
- **THEN** 主进程删除 `<sessionId>.json` 和 `<sessionId>.messages.jsonl` 文件
- **AND** 调 `attachment-store.removeSessionAttachments(projectPath, sessionId)` 递归删除 `<sessionId>/attachments/` 目录
- **AND** attachments 目录不存在时不抛错，整体仍返回 ok

### Requirement: session_info_update 事件处理链路

系统 SHALL 在 ACP agent 推送 `session_info_update` 事件时，将标题变更持久化到磁盘并通知前端。

#### Scenario: Agent 推送 session 标题

- **WHEN** ACP agent 推送 `sessionUpdate === "session_info_update"` 且 `title` 字段非空
- **THEN** `acp-mapper.ts` 将其映射为 `SessionEvent: { type: "session_info_update", title }`
- **AND** 主进程 IPC handler 调用 `saveSessionMeta` 更新磁盘中的 `title` 字段
- **AND** 通过 MessagePort 发送 `{ type: "chunk", data: { kind: "session_info_update", title } }` 给渲染进程

#### Scenario: 前端收到标题更新

- **WHEN** 渲染进程收到 `kind: "session_info_update"` chunk
- **THEN** 前端 chat store 更新对应 session 的 `title` 字段，UI 实时反映新标题

#### Scenario: Agent 未推送标题时保持调用方初始化标题

- **WHEN** ACP agent 在整轮对话中未推送 `session_info_update`
- **THEN** 主进程保持 `chat:createSession` 初始写入的 `title` 不变

系统 SHALL 提供 `chat:loadMessages` IPC handler，从磁盘读取指定 session 的历史消息列表。

#### Scenario: 加载历史消息

- **WHEN** 渲染进程调用 `chat:loadMessages` 并传入 `{ sessionId, projectId }`
- **THEN** 主进程调用 `loadMessages(projectPath, sessionId)`，返回 `Message[]`

#### Scenario: 无历史消息时返回空数组

- **WHEN** 渲染进程调用 `chat:loadMessages`，且该 session 无消息文件
- **THEN** 返回空数组 `[]`

### Requirement: MessageAssembler 支持 reasoning 轨道

系统 SHALL 在 `electron/main/domain/chat/message-assembler.ts#MessageAssembler` 中引入独立的 reasoning 轨道，与既有 text 轨道对等独立。

具体规则：

- 新增字段 `private activeReasoningPartIdx = -1`，在 `constructor` 初始化与每次 `flush()` 结束时重置为 -1；`ensureMessage()` 在**新建** assistant message 的路径（`this.currentMessage` 为 `null` 时）上一并重置为 -1。
- `apply(ev)` 新增 `ev.type === "reasoning_delta"` 分支：
  1. 调用 `ensureMessage()` 获取当前 assistant message；
  2. 若 `activeReasoningPartIdx >= 0` 且 `message.parts[activeReasoningPartIdx]?.type === "reasoning"`，将 `ev.text` 追加到该 part 的 `.text`；
  3. 否则 `message.parts.push({ type: "reasoning", text: ev.text })` 并将 `activeReasoningPartIdx` 设为新 part 的索引；
  4. 重置 `this.activeTextPartIdx = -1`。
- `apply(ev)` 的既有 `text_delta` 分支 SHALL 在新建 text part 或 append 到 text part 后，重置 `this.activeReasoningPartIdx = -1`。
- `apply(ev)` 的既有 `tool_call_start` 分支 SHALL 同时重置 `this.activeTextPartIdx = -1` 与 `this.activeReasoningPartIdx = -1`。
- `apply(ev)` 方法体内 SHALL 仅分派 `text_delta` / `reasoning_delta` / `tool_call_start` / `tool_call_update` 四个分支；其余 `SessionEvent` 成员（`available_commands_update` / `usage_update` / `session_info_update` / `done` / `error` / `session_id_resolved`）经过时不做任何处理（方法签名 `apply(ev: SessionEvent): void` 不变，只是函数体无对应分支）。
- `flush()` 产出的 `UIMessage.parts` 可包含任意顺序的 text / reasoning / dynamic-tool part，顺序严格与事件到达顺序一致。
- reasoning part 的结构为 `{ type: "reasoning", text: string }`（与 AI SDK `ReasoningUIPart` 对齐）。SHALL NOT 写入 `state` 字段；流式视觉由外层 `UChatMessages :status` 与 `isPartStreaming(part)` 判定，不依赖 part 自身 state 字段。

#### Scenario: 单条 reasoning 流合并到同一 part

- **WHEN** assembler 连续收到 3 个 `reasoning_delta` 事件（text 分别为 "abc"、"de"、"fg"）
- **THEN** `flush()` 返回的 `UIMessage.parts` 长度为 1
- **AND** 该 part 为 `{ type: "reasoning", text: "abcdefg" }`

#### Scenario: reasoning 与 text 交替产出多 part

- **WHEN** assembler 依次收到 reasoning "r1"、text "t1"、reasoning "r2"、text "t2"
- **THEN** `flush()` 返回的 `UIMessage.parts` 为 `[reasoning("r1"), text("t1"), reasoning("r2"), text("t2")]`，顺序严格对应

#### Scenario: reasoning 被 tool 中断后再次续写

- **WHEN** assembler 依次收到 reasoning "r1"、tool_call_start、tool_call_update(completed)、reasoning "r2"
- **THEN** `flush()` 返回的 `UIMessage.parts` 为 `[reasoning("r1"), dynamic-tool(output-available), reasoning("r2")]`
- **AND** `activeReasoningPartIdx` 在 `tool_call_start` 后被重置，因此 "r2" 进入新的 reasoning part

#### Scenario: reasoning 作为 assistant message 首个 part

- **WHEN** assembler 尚未处理任何事件（`this.currentMessage === null`），直接收到 `reasoning_delta`
- **THEN** `ensureMessage` 创建新的 assistant `UIMessage` 并赋值给 `this.currentMessage`
- **AND** 该消息的首个 part 为新建的 reasoning part，`activeReasoningPartIdx` 指向该 part
- **AND** 后续 text / tool 事件可继续追加到同一 `this.currentMessage`，直到 `flush()` 被调用

### Requirement: AcpSession 通过注入的 AcpSessionStore 完成 acpSessionId 持久化

`AcpSessionOpts` SHALL 新增必填字段 `sessionStore: AcpSessionStore`，其中 `AcpSessionStore` 由 `electron/main/domain/chat/acp-session-store.ts` 导出，接口契约为：

```ts
export interface AcpSessionStore {
  loadAcpSessionId(): Promise<string | null>;
  persistAcpSessionId(acpSessionId: string): Promise<void>;
}
```

`AcpSession.start` SHALL 通过 `await this.opts.sessionStore.loadAcpSessionId()` 获取 `persistedSessionId`，SHALL NOT 直接调用 `loadSessionMeta`。`AcpSession` 在以下两种时机 SHALL 调用 `await this.opts.sessionStore.persistAcpSessionId(acpSessionId)`：

1. `tryHandlePersistedSession` 中 direct prompt 成功后（保持原 `persistResolvedSession` 时机）
2. `completeRecoveredPrompt` 中 recovery 完成、即将发起最终 prompt 之前（保持原 `persistResolvedSession` 时机）

`AcpSession` 模块 SHALL NOT 再 import `@main/infra/storage/session-store`。

#### Scenario: AcpSession.start 通过 sessionStore 读取 persistedSessionId

- **WHEN** `AcpSession.start(prompt)` 被调用
- **THEN** 系统通过 `await this.opts.sessionStore.loadAcpSessionId()` 获得 `persistedSessionId`
- **AND** 不调用 `loadSessionMeta`
- **AND** 后续 direct prompt / resume / load / new 路径决策仅依赖该值

#### Scenario: direct prompt 成功后通过 sessionStore 持久化

- **WHEN** `AcpSession.start` 走 `tryHandlePersistedSession` 分支并 direct prompt 成功
- **THEN** 系统调用 `await this.opts.sessionStore.persistAcpSessionId(persistedSessionId)`
- **AND** 不调用 `upsertSessionMeta`
- **AND** emit `session_id_resolved` 事件

#### Scenario: newSession 成功后通过 sessionStore 持久化

- **WHEN** `AcpSession.start` 走 `completeRecoveredPrompt` 分支，且 `recovery.createdNewSession === true`
- **THEN** 系统调用 `await this.opts.sessionStore.persistAcpSessionId(recovery.sessionId)`
- **AND** 不调用 `upsertSessionMeta`
- **AND** 随后按 `system-reminder-injection` spec 完成 reminder 注入流程

#### Scenario: chat IPC handler 构造 AcpSession 时注入 ChatAcpSessionStore

- **WHEN** `chat:stream:message` 的 handler 构造 `AcpSession`
- **THEN** `opts.sessionStore` 为 `ChatAcpSessionStore` 实例
- **AND** `opts.owner` 为 `"chat"`

#### Scenario: proposal-apply stage handler 构造 AcpSession 时注入 ApplyStageAcpSessionStore

- **WHEN** `proposal:stageStream` 的 handler 构造 `AcpSession`
- **THEN** `opts.sessionStore` 为 `ApplyStageAcpSessionStore` 实例，构造参数包含 `(projectPath, changeId, runId, stageIndex)`
- **AND** `opts.owner` 为 `"apply"`

#### Scenario: proposal-archive handler 构造 AcpSession 时注入 ArchiveAcpSessionStore

- **WHEN** `proposal:archive` 的 handler 构造 `AcpSession`
- **THEN** `opts.sessionStore` 为 `ArchiveAcpSessionStore` 实例，构造参数包含 `(projectPath, changeId)`
- **AND** `opts.owner` 为 `"archive"`

### Requirement: ACP sessions receive both bundled Fyllo MCP servers

When bundled MCP is enabled, ACP session creation and recovery SHALL receive both bundled Fyllo MCP servers from `getBundledMcpServers({ projectPath })`: `fyllo-specs` and `fyllo-skills`.

This requirement applies to `connection.newSession({ cwd, mcpServers })`, `connection.resumeSession({ sessionId, cwd, mcpServers })`, and `connection.loadSession({ sessionId, cwd, mcpServers })`. ACP session code SHALL continue to treat `getBundledMcpServers({ projectPath })` as the only source of bundled MCP descriptors and SHALL NOT hard-code either server in `services/chat/acp-session.ts`.

#### Scenario: newSession receives specs and skills servers

- **WHEN** `AcpSession.start` creates a fresh ACP session and bundled MCP is not disabled
- **THEN** `connection.newSession({ cwd, mcpServers })` receives an `mcpServers` list containing one spec with `name === "fyllo-specs"`
- **AND** the same list contains one spec with `name === "fyllo-skills"`

#### Scenario: resumeSession receives specs and skills servers

- **WHEN** session recovery calls `connection.resumeSession({ sessionId, cwd, mcpServers })` and bundled MCP is not disabled
- **THEN** the `mcpServers` list contains one spec with `name === "fyllo-specs"`
- **AND** the same list contains one spec with `name === "fyllo-skills"`

#### Scenario: loadSession receives specs and skills servers

- **WHEN** session recovery calls `connection.loadSession({ sessionId, cwd, mcpServers })` and bundled MCP is not disabled
- **THEN** the `mcpServers` list contains one spec with `name === "fyllo-specs"`
- **AND** the same list contains one spec with `name === "fyllo-skills"`

#### Scenario: disable flag removes both bundled servers from ACP sessions

- **WHEN** `FYLLO_DISABLE_BUNDLED_MCP=1`
- **AND** `AcpSession.start` creates or recovers an ACP session
- **THEN** the `mcpServers` list passed to ACP is empty
- **AND** neither `fyllo-specs` nor `fyllo-skills` is included

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

### Requirement: AcpSession 在 session 创建/恢复响应处发出 configOptions

`AcpSession` SHALL 在以下三类入口拿到 ACP 响应后，立即将响应中的 `configOptions` 字段（`Array<SessionConfigOption> | null | undefined`）映射成 `SessionEvent { type: "config_options_update"; options: AcpSessionConfigOption[] }` 并通过 `this.emit("event", ...)` 发出：

1. `recoverSession` 中调用 `connection.newSession({ cwd, mcpServers })` 成功返回时；
2. `recoverSession` 中调用 `connection.resumeSession({ sessionId, cwd, mcpServers })` 成功返回时；
3. `recoverSession` 中调用 `connection.loadSession({ sessionId, cwd, mcpServers })` 成功返回时。

`tryHandlePersistedSession` 走 direct prompt 分支不发起 session 创建/恢复请求，因此 SHALL NOT 在该分支主动发出 `config_options_update`；该路径下的 `configOptions` 来源依赖于 turn 进行中由 agent 推送的 `sessionUpdate: "config_option_update"`。

当响应中 `configOptions` 为 `null` / `undefined` 或长度为 0 时，系统 SHALL 仍发出一次 `config_options_update`，`options` 为空数组，使下游可以"显式知道 agent 不暴露任何 configOptions"。

`AcpSessionConfigOption` 类型由 `shared/types/acp-config.ts` 导出，结构为：

```ts
type AcpSessionConfigOptionValue = string;

interface AcpSessionConfigOptionValueItem {
  value: AcpSessionConfigOptionValue;
  name: string;
  description?: string;
}

interface AcpSessionConfigOptionGroup {
  group: string;
  name: string;
  options: AcpSessionConfigOptionValueItem[];
}

type AcpSessionConfigOptionCategory = "mode" | "model" | "thought_level" | string;

interface AcpSessionConfigSelect {
  type: "select";
  id: string;
  name: string;
  description?: string;
  category?: AcpSessionConfigOptionCategory;
  currentValue: AcpSessionConfigOptionValue;
  options: AcpSessionConfigOptionValueItem[] | AcpSessionConfigOptionGroup[];
}

interface AcpSessionConfigBoolean {
  type: "boolean";
  id: string;
  name: string;
  description?: string;
  category?: AcpSessionConfigOptionCategory;
  currentValue: boolean;
}

type AcpSessionConfigOption = AcpSessionConfigSelect | AcpSessionConfigBoolean;
```

主进程 SHALL 在归一化时丢弃 `_meta` 字段，把 `null` 归一为 `undefined`。SDK 类型 `SessionConfigOption` SHALL NOT 出现在 `shared/` 与 `frontend/` 任何文件的 import 列表中。

#### Scenario: newSession 响应包含 configOptions

- **WHEN** `AcpSession.start` 走到 `recoverSession` 的 fresh-newSession 分支，`connection.newSession(...)` 返回 `{ sessionId, configOptions: [<3 项>] }`
- **THEN** 系统在 emit `session_id_resolved` 之后，emit `{ type: "config_options_update", options: <归一化后的 3 项> }`
- **AND** 归一化结果不包含任何 `_meta` 字段
- **AND** `category` 为 `null` 的项被归一为 `undefined`

#### Scenario: resumeSession 响应包含 configOptions

- **WHEN** `recoverSession` 走 `resumeSession` 成功分支，响应包含非空 `configOptions`
- **THEN** 系统 emit `{ type: "config_options_update", options: <...> }`

#### Scenario: loadSession 响应包含 configOptions

- **WHEN** `recoverSession` 走 `loadSession` 成功分支，响应包含非空 `configOptions`
- **THEN** 系统 emit `{ type: "config_options_update", options: <...> }`
- **AND** `runtimeState.suppressReplay` 为 `true` 时仍 emit 该事件，不被 replay 抑制（参见 `acp-session-recovery#shouldSuppressDuringReplay` 白名单）

#### Scenario: 响应未携带 configOptions

- **WHEN** `connection.newSession` 返回的对象中 `configOptions` 为 `null`、`undefined` 或长度 0
- **THEN** 系统仍 emit 一次 `{ type: "config_options_update", options: [] }`

#### Scenario: direct prompt 分支不主动发 configOptions

- **WHEN** `AcpSession.start` 走 `tryHandlePersistedSession` 并 direct prompt 成功
- **THEN** 系统 SHALL NOT 因 direct prompt 成功而主动 emit `config_options_update`
- **AND** turn 进行中收到的 `sessionUpdate: "config_option_update"` 仍按映射规则透传

### Requirement: ACP sessionUpdate config_option_update 映射

`acp-mapper.ts` SHALL 处理 `sessionUpdate === "config_option_update"`，将 `update.configOptions: SessionConfigOption[]` 归一化为 `AcpSessionConfigOption[]`，产出 `SessionEvent { type: "config_options_update"; options }`。

归一化规则与"AcpSession 在 session 创建/恢复响应处发出 configOptions"中规定的相同：丢弃 `_meta`，`null`-to-`undefined`，保持 `select.options` 形态（平铺 vs 分组）。

`acp-session-recovery#shouldSuppressDuringReplay` SHALL 把 `config_options_update` 加入"loadSession replay 期间不抑制"的白名单，与 `available_commands_update`、`session_info_update` 同等待遇。

#### Scenario: server-push 推送 config_option_update

- **WHEN** ACP agent 在 turn 进行中推送 `sessionUpdate === "config_option_update"`，携带 `configOptions: [<5 项>]`
- **THEN** `acp-mapper` 产出 `SessionEvent { type: "config_options_update", options: <归一化 5 项> }`
- **AND** `acp-session.runPrompt` 内的 `sessionHandler` 通过 `this.emit("event", ev)` 透传该事件

#### Scenario: loadSession replay 期间不抑制

- **WHEN** 系统在 loadSession 恢复流中，`runtimeState.suppressReplay === true`
- **AND** mapper 产出 `config_options_update` event
- **THEN** event 不被 `shouldSuppressDuringReplay` 过滤
- **AND** `runtimeState.suppressedReplayEvents` 计数不递增

### Requirement: chat:stream:message handler 透传并持久化 config_options_update

`chat:stream:message` 主进程 handler SHALL 在 `AcpSession` emit `config_options_update` 事件时：

1. 通过 `session-event-mapper.toMessageChunk(ev)` 转换为 `MessageChunkData { kind: "config_options_update", options }`，再通过 `sink.sendChunk(chunk)` 推送给 renderer；
2. 通过 `enqueueSessionMetaPersist({ config_options: ev.options, updatedAt: new Date().toISOString() }, "[chat] failed to persist session config options update")` 调度字段级 session meta 持久化。

handler SHALL NOT 把该事件分派给 `MessageAssembler.apply`。当 `options` 为空数组时仍然发送 chunk 并持久化为空数组（与 `available_commands_update` 行为对齐）。

`proposal:stageStream` / `proposal:archive` handler SHALL 对 `config_options_update` 事件显式忽略：不调用 `MessageAssembler.apply`、不调用 `sink.sendChunk`、不写磁盘。

#### Scenario: chat 流透传 config_options_update

- **WHEN** `chat:stream:message` 的 `AcpSession` emit `config_options_update` 事件
- **THEN** handler 通过 sink 发送 `{ type: "chunk", data: { kind: "config_options_update", options } }`
- **AND** 通过 session-store 字段级更新写入 `config_options`
- **AND** 不进入 `MessageAssembler`

#### Scenario: 空数组也透传与持久化

- **WHEN** `AcpSession` emit `config_options_update` 且 `options.length === 0`
- **THEN** handler 仍发送 chunk
- **AND** 仍调度 `config_options: []` 持久化

#### Scenario: proposal 流忽略 config_options_update

- **WHEN** `proposal:stageStream` 或 `proposal:archive` 的 `AcpSession` emit `config_options_update`
- **THEN** handler 不调用 `MessageAssembler.apply`
- **AND** 不调用 `sink.sendChunk`
- **AND** 不写磁盘

### Requirement: chat:setConfigOption IPC 在主进程封装 setSessionConfigOption

系统 SHALL 在 `electron/main/services/chat/config-option-service.ts` 提供 `setConfigOption({ projectId, sessionId, configId, type, value })` 函数，其行为：

1. 通过 `resolveProjectPath(projectId)` 与 `loadSessionMeta(projectPath, sessionId)` 加载 session meta；若 meta 不存在或 meta 中 `acpSessionId` 为空，SHALL 抛出 `ipcError(IpcErrorCodes.VALIDATION_ERROR)`，`message` 表明 acpSessionId 缺失（草稿态本不可达，IPC 入参校验已要求 sessionId 对应已建立的 session）。
2. 从 `SessionMeta.config_options` 读取目标 `configId` 的 schema：
   - 若 schema 存在且 `type === "select"`，SHALL 校验 `value` 是否在 `options` 集合中（兼容平铺 `AcpSessionConfigOptionValueItem[]` 与分组 `AcpSessionConfigOptionGroup[]` 两种 shape）；不在集合中 SHALL 抛出 `ipcError(IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE)`。
   - 若 schema 不存在，SHALL 跳过预校验直接发起 RPC（兜底由 agent 端错误处理）。
3. 通过 `getOrStartProcess(meta.agentId)` 获取 connection；若获取失败，SHALL 抛出 `ipcError(IpcErrorCodes.ACP_NOT_READY)`。
4. 调用 `connection.setSessionConfigOption({ sessionId: meta.acpSessionId, configId, ...payload })`，其中 `payload` 为 `type === "boolean" ? { type: "boolean", value: value as boolean } : { value: value as string }`。
5. 若调用因 ACP 协议错误码 `-32601`（method not found）或语义等价错误失败，SHALL 抛出 `ipcError(IpcErrorCodes.CONFIG_OPTION_NOT_SUPPORTED)`；其他错误归一为 `ipcError(IpcErrorCodes.ACP_ERROR)`。
6. 调用成功后，SHALL 通过 session-store 字段级更新接口将响应中的 `configOptions` 持久化到 `SessionMeta.config_options`，并把归一化后的 `AcpSessionConfigOption[]` 作为返回值返回。

`electron/main/ipc/chat.ts` SHALL 注册 `chat:setConfigOption` handler，签名为 `(input: { projectId: string; sessionId: string; configId: string; type: "select" | "boolean"; value: string | boolean }) => Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>>`，handler 函数体仅做 `validate(setConfigOptionInputSchema, input)` 与调用 service。

`shared/types/channels.ts` SHALL 在 `ChatChannels` 中新增 `setConfigOption: "chat:setConfigOption"`。

`shared/schemas/ipc/chat.ts` SHALL 导出 `setConfigOptionInputSchema`，校验：

- `projectId`: 非空字符串
- `sessionId`: 非空字符串
- `configId`: 非空字符串
- `type`: 字面量联合 `"select" | "boolean"`
- `value`: discriminated union（`type === "boolean"` ⇒ `z.boolean()`；`type === "select"` ⇒ `z.string().min(1)`）

`shared/constants/error-codes.ts` SHALL 新增 `CONFIG_OPTION_NOT_SUPPORTED` 与 `CONFIG_OPTION_INVALID_VALUE` 两个错误码。

`config-option-service.setConfigOption` SHALL NOT 通过 `sessionRegistry` 找到 `AcpSession` 并 `emit("event", ...)`。renderer 必须依赖 IPC 返回值更新 store。

#### Scenario: renderer 调 setConfigOption 成功

- **WHEN** renderer 调 `window.api.chat.setConfigOption({ projectId, sessionId, configId: "model", type: "select", value: "sonnet" })`
- **AND** session meta 中 `acpSessionId` 存在，`config_options` 含 id=`"model"` 的 select schema，`"sonnet"` 在其 options 集合
- **THEN** 主进程通过 `connection.setSessionConfigOption(...)` 调用 ACP
- **AND** 把返回的 `configOptions` 持久化到 session meta 的 `config_options` 字段
- **AND** 返回 `{ ok: true, data: { configOptions } }`

#### Scenario: value 不在 schema 中被预校验拦截

- **WHEN** session meta 的 `config_options` 中 id=`"model"` 的 options 集合不包含 `"gpt-4"`
- **AND** renderer 传入 `{ configId: "model", type: "select", value: "gpt-4" }`
- **THEN** 主进程在调用 ACP RPC 之前返回 `{ ok: false, error: { code: "CONFIG_OPTION_INVALID_VALUE" } }`
- **AND** 不调用 `connection.setSessionConfigOption`

#### Scenario: agent 不实现 setSessionConfigOption

- **WHEN** ACP RPC 返回方法未实现错误（JSON-RPC `-32601` 或语义等价）
- **THEN** 主进程返回 `{ ok: false, error: { code: "CONFIG_OPTION_NOT_SUPPORTED" } }`

#### Scenario: session 没有 acpSessionId（草稿态保护）

- **WHEN** renderer 传入的 `sessionId` 对应 session meta 不存在或其 `acpSessionId` 为空
- **THEN** 主进程返回 `{ ok: false, error: { code: "VALIDATION_ERROR" } }`
- **AND** 不调用 `connection.setSessionConfigOption`

#### Scenario: 分组 options shape 也支持

- **WHEN** session meta 的某 select schema 的 `options` 为 `AcpSessionConfigOptionGroup[]`
- **AND** renderer 传入的 `value` 出现在某个 group 的 `options` 项里
- **THEN** 预校验通过，正常发起 RPC

### Requirement: bundled MCP servers 注入路径不受影响

`config-option-service.setConfigOption` SHALL NOT 修改、注入或移除任何 `mcpServers` 配置。该接口只代理 ACP `session/set_config_option` 调用，与 bundled MCP 拼装无关。

#### Scenario: setConfigOption 不读 bundled MCP

- **WHEN** `config-option-service.setConfigOption` 被调用
- **THEN** 函数体内不调用 `getBundledMcpServers`
- **AND** 不引用 `FYLLO_DISABLE_BUNDLED_MCP` 环境变量

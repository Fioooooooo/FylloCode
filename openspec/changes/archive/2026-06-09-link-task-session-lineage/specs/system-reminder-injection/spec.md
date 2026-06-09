## MODIFIED Requirements

### Requirement: 主进程全权控制 system-reminder 注入

系统 SHALL 在主进程内提供 `resolveSystemReminder(ctx: SystemReminderContext): Promise<TextUIPart | null>` 函数，按 `owner` 分派到对应 provider。返回非 null 时返回值 SHALL 为 `TextUIPart`（`ai` 包中的类型，形如 `{ type: "text", text: string }`），其 `text` 字段首位为 `<system-reminder>`、末位为 `</system-reminder>`（允许内部换行）。返回 null 表示不注入。

`SystemReminderContext` 的字段 SHALL 为：`owner`（复用 `@main/services/chat/session-registry#SessionOwner`，即 `"chat" | "apply" | "archive"`）、`projectPath`、`cwd`、`fylloSessionId`、`agentId`、以及可选的 `changeId` / `stageIndex` / `runId` / `worktreePath` / `taskRef`。其中 `taskRef` SHALL 为可选的 `LineageTaskRef`（形如 `<source>:<id>`），表示当前会话发起讨论时所针对的任务引用；其取值 SHALL 由 stream handler 在 `onReady` 内通过 `loadSessionMeta` 读取 `meta.originTaskRef` 后填入 `reminderContext`，复用 `changeId` 既有的流入路径（`reminderContext` → `AcpSession` → `resolveReminderParts`）。

reminder 相关代码（provider、模板、类型）SHALL 全部位于 `src/main/services/chat/system-reminder/`，`src/renderer/` 与 `src/preload/` SHALL NOT import 该目录下的任何模块。系统 SHALL NOT 新增任何 IPC 通道、preload 暴露、`src/shared/` 类型，用以让用户或渲染进程影响 reminder 内容或触发时机。

#### Scenario: 已注册的 owner 返回 TextUIPart

- **WHEN** 使用 `owner ∈ {"chat", "apply", "archive"}` 调用 `resolveSystemReminder`
- **AND** 对应 provider 存在且模板插值成功
- **THEN** 返回 `TextUIPart`（`type === "text"`），其 `text` 经 trim 后以 `<system-reminder>` 开头、以 `</system-reminder>` 结尾

#### Scenario: 未识别 owner 返回 null

- **WHEN** `owner` 不在已注册 provider 列表中
- **THEN** 返回 `null`
- **AND** 不抛出异常

#### Scenario: chat owner 上下文携带 taskRef

- **WHEN** stream handler 在 `onReady` 内读取到 session meta 的 `originTaskRef` 非空
- **THEN** 构造 `AcpSession` 时 `reminderContext.taskRef` 被赋为该值
- **AND** `resolveSystemReminder` 收到的 `SystemReminderContext.taskRef` 等于 `meta.originTaskRef`

#### Scenario: 无 originTaskRef 时 taskRef 为 undefined

- **WHEN** session meta 不含 `originTaskRef`
- **THEN** `SystemReminderContext.taskRef` 为 `undefined`
- **AND** chat reminder 不注入任务感知内容

## ADDED Requirements

### Requirement: chat reminder 感知会话所针对的已存在任务

系统 SHALL 在 chat owner 的 system-reminder 中，当 `SystemReminderContext.taskRef` 非空时，注入"当前讨论针对一个已存在 task"的感知说明，使 agent 知晓本会话源自某个任务而非空白发起。该感知内容 SHALL 只影响 chat reminder，不影响 apply 或 archive reminder。

`taskRef` SHALL 作为白名单模板变量参与插值（与 `changeId` 等同位治理）；其值若包含 `<` 或 `>` 字符，provider SHALL 按现有 sanitize 规则返回 `null` 并 `logger.warn`。`taskRef` 为 `undefined` 时，chat reminder SHALL NOT 包含任务感知段落，且 SHALL 正常渲染其余内容。

系统 SHALL NOT 在 reminder 中嵌入任务的标题或描述全文（仅 ref 级别感知）；任务详情的展示由 `chat-origin-task-banner` 能力负责。

#### Scenario: 携带 taskRef 时注入任务感知

- **WHEN** 主进程为 chat owner 渲染 system-reminder，且 `taskRef = "local:abc123"`
- **THEN** reminder 文本包含针对该任务讨论的感知说明
- **AND** 文本包含 `taskRef` 的值或其插值结果

#### Scenario: 无 taskRef 时不注入任务感知

- **WHEN** 主进程为 chat owner 渲染 system-reminder，且 `taskRef` 为 `undefined`
- **THEN** reminder 文本不包含任务感知段落
- **AND** reminder 其余内容（consent、stage、fyllo-action 协议等）正常渲染

#### Scenario: taskRef 值含尖括号时跳过注入

- **WHEN** `taskRef` 的值包含 `<` 或 `>` 字符
- **THEN** provider 返回 `null`
- **AND** 写入 `logger.warn`，至少包含 owner、被拒字段名、`fylloSessionId`

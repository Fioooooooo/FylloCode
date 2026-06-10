## MODIFIED Requirements

### Requirement: chat reminder 感知会话所针对的已存在任务

系统 SHALL 在 chat owner 的 system-reminder 中，当 `SystemReminderContext.taskRef` 非空时，注入"当前讨论针对一个已存在 task"的感知说明，使 agent 知晓本会话源自某个任务而非空白发起。该感知内容 SHALL 只影响 chat reminder，不影响 apply 或 archive reminder。

系统 SHALL 在该感知说明中注入任务的**标题**作为 agent 的语义锚点。标题取值 SHALL 由 stream handler 在 `onReady` 内、读取 `meta.originTaskRef` 之后，通过 `lineage-service.getByTask(projectPath, originTaskRef)` 读取该任务的 lineage 快照标题（`TaskDownstreamProjection.task.snapshot.title`），填入 `reminderContext` 的任务标题字段，复用 `taskRef` 既有的流入路径（`reminderContext` → `AcpSession` → `resolveReminderParts`）。当 `getByTask` 返回 `null` 或快照缺失标题时，reminder SHALL 仅注入 `taskRef` 级别的感知，SHALL NOT 因标题缺失而失败。

系统 SHALL NOT 在 reminder 中嵌入任务的**描述**全文或摘要；任务标题之外的详情展示由 `chat-origin-task-banner` 能力负责。`taskRef` 与任务标题 SHALL 作为白名单模板变量参与插值（与 `changeId` 等同位治理）；任一变量值若包含 `<` 或 `>` 字符，provider SHALL 按现有 sanitize 规则返回 `null` 并 `logger.warn`。`taskRef` 为 `undefined` 时，chat reminder SHALL NOT 包含任务感知段落，且 SHALL 正常渲染其余内容。

#### Scenario: 携带 taskRef 时注入任务感知与标题

- **WHEN** 主进程为 chat owner 渲染 system-reminder，且 `taskRef = "local:abc123"`，对应 lineage 快照标题为 "修复登录超时"
- **THEN** reminder 文本包含针对该任务讨论的感知说明
- **AND** 文本包含 `taskRef` 的值或其插值结果
- **AND** 文本包含任务标题 "修复登录超时"

#### Scenario: 快照缺失标题时仅注入 ref 级感知

- **WHEN** 主进程为 chat owner 渲染 system-reminder，且 `taskRef` 非空，但 `getByTask` 返回 `null` 或快照无标题
- **THEN** reminder 文本仍包含任务感知段落与 `taskRef`
- **AND** 文本不包含任务标题
- **AND** reminder 正常渲染，不抛错

#### Scenario: 不注入任务描述

- **WHEN** 主进程为 chat owner 渲染 system-reminder，且任务快照含非空描述
- **THEN** reminder 文本不包含任务描述全文或摘要

#### Scenario: 无 taskRef 时不注入任务感知

- **WHEN** 主进程为 chat owner 渲染 system-reminder，且 `taskRef` 为 `undefined`
- **THEN** reminder 文本不包含任务感知段落
- **AND** reminder 其余内容（consent、stage、fyllo-action 协议等）正常渲染

#### Scenario: 任务标题含尖括号时跳过注入

- **WHEN** 任务标题或 `taskRef` 的值包含 `<` 或 `>` 字符
- **THEN** provider 返回 `null`
- **AND** 写入 `logger.warn`，至少包含 owner、被拒字段名、`fylloSessionId`

### Requirement: 主进程全权控制 system-reminder 注入

系统 SHALL 在主进程内提供 `resolveSystemReminder(ctx: SystemReminderContext): Promise<TextUIPart | null>` 函数，按 `owner` 分派到对应 provider。返回非 null 时返回值 SHALL 为 `TextUIPart`（`ai` 包中的类型，形如 `{ type: "text", text: string }`），其 `text` 字段首位为 `<system-reminder>`、末位为 `</system-reminder>`（允许内部换行）。返回 null 表示不注入。

`SystemReminderContext` 的字段 SHALL 为：`owner`（复用 `@main/services/chat/session-registry#SessionOwner`，即 `"chat" | "apply" | "archive"`）、`projectPath`、`cwd`、`fylloSessionId`、`agentId`、以及可选的 `changeId` / `stageIndex` / `runId` / `worktreePath` / `taskRef` / `taskTitle`。其中 `taskRef` SHALL 为可选的 `LineageTaskRef`（形如 `<source>:<id>`），表示当前会话发起讨论时所针对的任务引用；`taskTitle` SHALL 为可选字符串，表示该任务的标题。两者取值 SHALL 由 stream handler 在 `onReady` 内填入 `reminderContext`：`taskRef` 取自 `loadSessionMeta` 的 `meta.originTaskRef`；`taskTitle` 取自 `lineage-service.getByTask(projectPath, originTaskRef)` 的快照标题（读取失败或缺失时为 `undefined`）。两者复用 `changeId` 既有的流入路径（`reminderContext` → `AcpSession` → `resolveReminderParts`）。

reminder 相关代码（provider、模板、类型）SHALL 全部位于 `src/main/services/chat/system-reminder/`，`src/renderer/` 与 `src/preload/` SHALL NOT import 该目录下的任何模块。系统 SHALL NOT 新增任何 IPC 通道、preload 暴露、`src/shared/` 类型，用以让用户或渲染进程影响 reminder 内容或触发时机。

#### Scenario: 已注册的 owner 返回 TextUIPart

- **WHEN** 使用 `owner ∈ {"chat", "apply", "archive"}` 调用 `resolveSystemReminder`
- **AND** 对应 provider 存在且模板插值成功
- **THEN** 返回 `TextUIPart`（`type === "text"`），其 `text` 经 trim 后以 `<system-reminder>` 开头、以 `</system-reminder>` 结尾

#### Scenario: 未识别 owner 返回 null

- **WHEN** `owner` 不在已注册 provider 列表中
- **THEN** 返回 `null`
- **AND** 不抛出异常

#### Scenario: chat owner 上下文携带 taskRef 与 taskTitle

- **WHEN** stream handler 在 `onReady` 内读取到 session meta 的 `originTaskRef` 非空
- **AND** `getByTask` 返回含标题的任务快照
- **THEN** 构造 `AcpSession` 时 `reminderContext.taskRef` 被赋为 `originTaskRef`，`reminderContext.taskTitle` 被赋为快照标题
- **AND** `resolveSystemReminder` 收到的 `SystemReminderContext.taskRef` / `taskTitle` 等于上述值

#### Scenario: 无 originTaskRef 时 taskRef 与 taskTitle 均为 undefined

- **WHEN** session meta 不含 `originTaskRef`
- **THEN** `SystemReminderContext.taskRef` 与 `taskTitle` 均为 `undefined`
- **AND** chat reminder 不注入任务感知内容

### Requirement: 模板变量白名单与 sanitize

系统 SHALL 使用文本模板（每个 owner 一份 `.md` 或 `.txt` 文件）配合白名单变量插值生成 reminder 正文。允许的变量名 SHALL 限定为 `{{changeId}}`、`{{stageIndex}}`、`{{runId}}`、`{{projectPath}}`、`{{worktreePath}}`、`{{mainProjectPath}}`、`{{taskRef}}`、`{{taskTitle}}`；其他 `{{...}}` 占位符保持字面量不替换。

`{{worktreePath}}` 与 `{{mainProjectPath}}` 的取值规则：

- `{{worktreePath}}` 取自 `SystemReminderContext.worktreePath`；为 `undefined` 时按 sanitize 流程渲染为空字符串 `""`。
- `{{mainProjectPath}}` 是 `SystemReminderContext.projectPath` 的别名（值完全等同），仅作为模板叙述的语义化变量名，方便在 worktree 编排段落中明确区分"主仓库路径"与"worktree 路径"。

`{{taskRef}}` 取自 `SystemReminderContext.taskRef`，`{{taskTitle}}` 取自 `SystemReminderContext.taskTitle`；二者为 `undefined` 时按 sanitize 流程渲染为空字符串 `""`，且任务感知段落的呈现由 chat provider 依据 `taskRef` 是否非空控制（见 chat reminder 感知任务 requirement）。

若任一白名单变量的实际值包含 `<` 或 `>` 字符，provider SHALL 返回 `null`（跳过该 session 的 reminder 注入），并通过 `logger.warn` 记录。日志字段 SHALL 至少包含 `owner`、被拒字段名、`fylloSessionId`。

系统 SHALL 提供内部 util `wrapAsSystemReminder(body: string): string`，以 `<system-reminder>\n{body}\n</system-reminder>` 包裹正文。若 `body` 字面量已包含 `<system-reminder>` 或 `</system-reminder>` 字符串，`wrapAsSystemReminder` SHALL 抛 `Error`（开发期即暴露模板错误，不做静默 sanitize）。该 util 不对外导出给 IPC handler。

#### Scenario: 白名单变量被替换

- **WHEN** provider 读取模板，上下文提供 `changeId = "add-foo-bar"`
- **THEN** 模板中的 `{{changeId}}` 被替换为 `"add-foo-bar"`

#### Scenario: taskTitle 占位符替换

- **WHEN** provider 读取 chat 模板，上下文 `taskTitle = "修复登录超时"`
- **THEN** 模板中的 `{{taskTitle}}` 被替换为该字符串字面量

#### Scenario: taskTitle 为 undefined 时渲染空字符串

- **WHEN** provider 读取模板，上下文 `taskTitle` 为 `undefined`
- **THEN** 模板中的 `{{taskTitle}}` 被替换为空字符串

#### Scenario: 非白名单占位符保留字面量

- **WHEN** 模板中出现 `{{unknownField}}`
- **THEN** 渲染后仍为 `{{unknownField}}` 字符串

#### Scenario: 变量值含尖括号时跳过注入

- **WHEN** 任一白名单变量（包含 `taskRef` / `taskTitle`）的值含 `<` 或 `>` 字符
- **THEN** provider 返回 `null`
- **AND** 写入 `logger.warn` 日志，至少包含 owner、被拒字段名、`fylloSessionId`

## ADDED Requirements

### Requirement: chat reminder 指导 agent 按会话绑定状态创建任务

系统 SHALL 在 chat owner 的 system-reminder（`chat.txt`）中注入规则，指导 agent 在调用 `mcp__fyllo_specs__create-proposal` 之后、写入任何 proposal artifacts 之前，判断当前会话是否已绑定任务，并据此分支：

- **已绑定任务**（reminder 含任务感知段落，即 `taskRef` 非空）：agent SHALL 仅创建 proposal，SHALL NOT 输出 `task.create` action。
- **未绑定任务**（reminder 不含任务感知段落）：agent SHALL 在开始写入 proposal artifacts 之前，先输出一个 `<fyllo-action type="task.create">` 标签，提示用户为本次开放讨论创建一个本地任务；任务的标题与描述 SHALL 由 agent 依据当前对话内容生成。

该规则 SHALL 只影响 chat reminder，不影响 apply 或 archive reminder。该规则 SHALL 复用既有 `<fyllo-action>` 协议注入内容（标签格式、`task.create` payload contract），SHALL NOT 在此重复一份可能漂移的 payload schema。

#### Scenario: chat reminder 注入分支规则

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** reminder 文本指示 agent 在 `create-proposal` 之后、写 artifacts 之前判断会话是否已绑定任务
- **AND** 文本说明已绑定时仅创建 proposal、不输出 `task.create`
- **AND** 文本说明未绑定时先输出 `task.create` action 再写 artifacts

#### Scenario: apply 和 archive reminder 不注入该分支规则

- **WHEN** 主进程为 apply 或 archive owner 渲染 system-reminder
- **THEN** reminder 文本不包含 create-proposal 后按绑定状态创建任务的分支规则

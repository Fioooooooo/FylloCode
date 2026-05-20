# system-reminder-injection Specification

## Purpose

定义主进程在 ACP session 新建时，按 owner 分发并持久化一次性 system-reminder 的能力，以及前端对该 reminder 的隐藏约束。

## Requirements

### Requirement: 主进程全权控制 system-reminder 注入

系统 SHALL 在主进程内提供 `resolveSystemReminder(ctx: SystemReminderContext): Promise<TextUIPart | null>` 函数，按 `owner` 分派到对应 provider。返回非 null 时返回值 SHALL 为 `TextUIPart`（`ai` 包中的类型，形如 `{ type: "text", text: string }`），其 `text` 字段首位为 `<system-reminder>`、末位为 `</system-reminder>`（允许内部换行）。返回 null 表示不注入。

`SystemReminderContext` 的字段 SHALL 为：`owner`（复用 `@main/services/chat/session-registry#SessionOwner`，即 `"chat" | "apply" | "archive"`）、`projectPath`、`cwd`、`fylloSessionId`、`agentId`、以及可选的 `changeId` / `stageIndex` / `runId`。

reminder 相关代码（provider、模板、类型）SHALL 全部位于 `electron/main/services/chat/system-reminder/`，`frontend/` 与 `electron/preload/` SHALL NOT import 该目录下的任何模块。系统 SHALL NOT 新增任何 IPC 通道、preload 暴露、`shared/` 类型，用以让用户或渲染进程影响 reminder 内容或触发时机。

#### Scenario: 已注册的 owner 返回 TextUIPart

- **WHEN** 使用 `owner ∈ {"chat", "apply", "archive"}` 调用 `resolveSystemReminder`
- **AND** 对应 provider 存在且模板插值成功
- **THEN** 返回 `TextUIPart`（`type === "text"`），其 `text` 经 trim 后以 `<system-reminder>` 开头、以 `</system-reminder>` 结尾

#### Scenario: 未识别 owner 返回 null

- **WHEN** `owner` 不在已注册 provider 列表中
- **THEN** 返回 `null`
- **AND** 不抛出异常

### Requirement: 注入判定严格绑定 `connection.newSession()` 成功调用

系统 SHALL 在 `AcpSession.start` 的生命周期内，仅当本次调用执行了 `connection.newSession()` 并成功返回时，才执行 system-reminder 注入。`resumeSession` 成功时 SHALL NOT 注入。

系统 SHALL NOT 使用 `sessionMeta.turnCount`、任何实例级 `hasInjected` 标志、或 `wasResumed` 参数作为判定依据。

#### Scenario: 真·首次发送消息时注入

- **WHEN** `AcpSession.start` 被调用，且对应 `fylloSessionId` 无持久化的 `acpSessionId`
- **THEN** 系统调用 `connection.newSession()`
- **AND** 在 `newSession` 成功返回后、`connection.prompt()` 调用前，解析并注入 system-reminder

#### Scenario: resumeSession 成功时不注入

- **WHEN** `AcpSession.start` 被调用，且对应 `fylloSessionId` 有持久化 `acpSessionId`
- **AND** `connection.resumeSession(...)` 成功返回
- **THEN** 系统 SHALL NOT 注入 system-reminder
- **AND** `connection.prompt()` 的 `prompt` 数组结构保持为单一 user text block

#### Scenario: resumeSession 失败降级到 newSession 时注入

- **WHEN** `connection.resumeSession(...)` 抛出异常
- **AND** 系统降级调用 `connection.newSession()` 并成功返回
- **THEN** 系统 SHALL 按首次分支执行 reminder 注入

### Requirement: Reminder 以独立 text block 注入 ACP prompt 数组

系统 SHALL 将 `resolveSystemReminder` 返回的 `TextUIPart` 直接放入 `connection.prompt()` 的 `prompt` 数组**首位**，随后跟随原有的 user text block，即 `prompt: [reminderPart, { type: "text", text: userPrompt }]`。

系统 SHALL NOT 将 reminder 文本与 user prompt 拼接为单个 text block。

#### Scenario: 注入时 prompt 数组为 `[reminder, user]`

- **WHEN** 注入条件满足且 `resolveSystemReminder` 返回非 null
- **THEN** `connection.prompt` 调用参数的 `prompt` 字段为两元素数组，第一个 element 为 reminder text block，第二个 element 为 user text block

#### Scenario: 无 reminder 时 prompt 数组为 `[user]`

- **WHEN** 注入条件满足但 `resolveSystemReminder` 返回 `null`
- **THEN** `connection.prompt` 调用参数的 `prompt` 字段为单元素数组，仅含 user text block

### Requirement: Reminder 持久化到 user message 的 parts 首位

系统 SHALL 在 reminder 注入发生时，将 `resolveSystemReminder` 返回的 `TextUIPart` **pre-pend 到当前 owner 对应 `*.messages.jsonl` 中最后一条 `role === "user"` 消息的 `parts` 数组首位**，随后才调用 `connection.prompt()`。

系统 SHALL 提供磁盘原语 `prependReminderToLastUserMessage(filePath, reminderPart): Promise<void>`，三个 owner（chat / apply / archive）通过传入不同 jsonl 路径复用同一实现。原语实现 SHALL 为"全量读取 jsonl → 定位最后一条 `role === "user"` 消息 → 在其 `parts[0]` 位置插入 reminder part → 全量覆盖写回"。

持久化到磁盘的 reminder part 的 `type` 字段 SHALL 固定为 `"text"`（即 `TextUIPart`），系统 SHALL NOT 新增自定义 `part.type` 值。

系统 SHALL NOT 为 reminder 创建独立的 `UIMessage`，也 SHALL NOT 通过 sink 把 reminder chunk 同步到渲染进程的内存消息容器。"渲染进程当前 turn 内存中的 user message 与磁盘 user message 的 parts 结构不一致"是预期行为，不是缺陷。

#### Scenario: chat owner 把 reminder 写入 `<sessionId>.messages.jsonl`

- **WHEN** chat owner 满足注入条件并完成注入
- **THEN** 系统更新 `sessions/<sessionId>.messages.jsonl` 中当前 turn 的 user 消息，`parts[0]` 为 reminder text part（`type === "text"`）

#### Scenario: apply owner 把 reminder 写入 `stage-{N}.messages.jsonl`

- **WHEN** apply owner 满足注入条件并完成注入
- **THEN** 系统更新对应 `apply-runs/<changeId>/stage-{stageIndex}.messages.jsonl` 中的 user 消息，`parts[0]` 为 reminder text part

#### Scenario: archive owner 把 reminder 写入 `archive.messages.jsonl`

- **WHEN** archive owner 满足注入条件并完成注入
- **THEN** 系统更新 `apply-runs/<changeId>/archive.messages.jsonl` 中的 user 消息，`parts[0]` 为 reminder text part

#### Scenario: 持久化失败不阻塞 prompt 继续

- **WHEN** `prependReminderToLastUserMessage`（由 `onReminderInjected` 钩子调用）抛出异常
- **THEN** `AcpSession.start` 捕获异常并通过 `logger.error` 记录
- **AND** 不再上抛、不中断 stream
- **AND** 仍继续把 reminder block 加入 ACP prompt 数组并调用 `connection.prompt()`

### Requirement: 模板变量白名单与 sanitize

系统 SHALL 使用文本模板（每个 owner 一份 `.md` 或 `.txt` 文件）配合白名单变量插值生成 reminder 正文。允许的变量名 SHALL 限定为 `{{changeId}}`、`{{stageIndex}}`、`{{runId}}`、`{{projectPath}}`、`{{worktreePath}}`、`{{mainProjectPath}}`；其他 `{{...}}` 占位符保持字面量不替换。

`{{worktreePath}}` 与 `{{mainProjectPath}}` 的取值规则：

- `{{worktreePath}}` 取自 `SystemReminderContext.worktreePath`；为 `undefined` 时按 sanitize 流程渲染为空字符串 `""`。
- `{{mainProjectPath}}` 是 `SystemReminderContext.projectPath` 的别名（值完全等同），仅作为模板叙述的语义化变量名，方便在 worktree 编排段落中明确区分"主仓库路径"与"worktree 路径"。

若任一白名单变量的实际值包含 `<` 或 `>` 字符，provider SHALL 返回 `null`（跳过该 session 的 reminder 注入），并通过 `logger.warn` 记录。日志字段 SHALL 至少包含 `owner`、被拒字段名、`fylloSessionId`。

系统 SHALL 提供内部 util `wrapAsSystemReminder(body: string): string`，以 `<system-reminder>\n{body}\n</system-reminder>` 包裹正文。若 `body` 字面量已包含 `<system-reminder>` 或 `</system-reminder>` 字符串，`wrapAsSystemReminder` SHALL 抛 `Error`（开发期即暴露模板错误，不做静默 sanitize）。该 util 不对外导出给 IPC handler。

#### Scenario: 白名单变量被替换

- **WHEN** provider 读取模板，上下文提供 `changeId = "add-foo-bar"`
- **THEN** 模板中的 `{{changeId}}` 被替换为 `"add-foo-bar"`

#### Scenario: 非白名单占位符保留字面量

- **WHEN** 模板中出现 `{{unknownField}}`
- **THEN** 渲染后仍为 `{{unknownField}}` 字符串

#### Scenario: worktreePath 占位符替换

- **WHEN** provider 读取模板，上下文 `worktreePath = "<mainRepo>/.worktrees/foo"`
- **THEN** 模板中的 `{{worktreePath}}` 被替换为该字符串字面量

#### Scenario: worktreePath 为 undefined 时渲染空字符串

- **WHEN** provider 读取模板，上下文 `worktreePath` 为 `undefined`
- **THEN** 模板中的 `{{worktreePath}}` 被替换为空字符串

#### Scenario: mainProjectPath 是 projectPath 别名

- **WHEN** provider 读取模板，上下文 `projectPath = "/Users/foo/myapp"`
- **THEN** 模板中的 `{{mainProjectPath}}` 被替换为 `/Users/foo/myapp`
- **AND** 模板中同时存在的 `{{projectPath}}` 也被替换为相同字符串

#### Scenario: 变量值含尖括号时跳过注入

- **WHEN** 任一白名单变量（包含 `worktreePath` / `mainProjectPath`）的值含 `<` 或 `>` 字符
- **THEN** provider 返回 `null`
- **AND** 写入 `logger.warn` 日志，至少包含 owner、被拒字段名、`fylloSessionId`

#### Scenario: 模板正文已含 system-reminder 标签时抛错

- **WHEN** `wrapAsSystemReminder(body)` 被调用，`body` 字面量包含 `<system-reminder>` 或 `</system-reminder>` 字符串
- **THEN** 抛 `Error`
- **AND** provider 将该异常冒泡（非 sanitize 能处理的 user 输入，是模板 bug）

### Requirement: chat reminder 编排 worktree 创建

`chat.txt` system-reminder 模板正文 SHALL 不再包含 shell-command worktree 编排序列。它 SHALL 指示 agent 在获得用户明确同意后调用 `mcp__fyllo_specs__create-proposal`，并依赖 tool 返回的 `state.workspace.path` 读取和修改所有 proposal artifacts。

reminder SHALL 说明：

- `create-proposal.workspaceMode` 可取 `"linked"` 或 `"main"`。
- 省略 `workspaceMode` 时默认使用 `"linked"`。
- 如果用户明确要求直接在 main workspace 工作，agent SHALL 在本次 `create-proposal` 调用中传入 `workspaceMode: "main"`。
- `workspaceMode` 是单次调用参数，不是项目偏好。
- `create-proposal` 返回后，agent SHALL 使用 `state.workspace.path` 作为 proposal artifacts 的工作目录。
- agent SHALL NOT 在 Chat stage 手动执行 `git worktree add`。

`chat.txt` SHALL NOT 包含 `.gitignore` 维护、`git worktree add`、`git merge`、`git worktree remove` 或 `git branch -d` 的 shell 命令。

#### Scenario: chat reminder 不再包含 worktree shell 创建

- **WHEN** 主进程为 chat owner 渲染 system-reminder 文本
- **THEN** 文本包含 `workspaceMode`
- **AND** 文本包含 `state.workspace.path`
- **AND** 文本包含 `mcp__fyllo_specs__create-proposal`
- **AND** 文本不包含 `git worktree add`
- **AND** 文本不包含 `.worktrees/<changeName>` shell command sequence

#### Scenario: chat reminder 保留 consent 与 stage 约束

- **WHEN** 主进程为 chat owner 渲染 system-reminder 文本
- **THEN** 文本仍含 `<authority>` / `<context>` / `<rules>` / `<critical>` 段
- **AND** `<critical>` 段中 "MUST obtain explicit user consent before calling create-proposal" 约束仍存在
- **AND** 文本指示 agent 不得在用户进入 Apply 或 Archive stage 前调用 `apply-change` 或 `archive-change`

### Requirement: apply reminder 暴露 worktreePath

`apply.txt` system-reminder 模板正文 SHALL 描述当前 stage workspace 已由 proposal workflow 准备完成。它 SHALL 使用 `{{worktreePath}}` / `{{mainProjectPath}}` 暴露当前 cwd 语义，但 SHALL NOT 指示 agent 创建、迁移、merge、remove 或删除 worktree。

reminder SHALL 说明：

- 当前 stage cwd 已由 host 设置为 `runMeta.worktreePath ?? projectPath`。
- 空的 `{{worktreePath}}` 表示当前 stage 运行在 main workspace。
- 非空的 `{{worktreePath}}` 表示当前 stage 运行在 linked worktree。
- agent SHALL 使用当前 stage workspace path 作为 `targetPath` 调用 `mcp__fyllo_specs__apply-change`。
- 业务代码 commit 仍由 agent 负责；Archive 不会替 agent 创建业务代码 commit。

#### Scenario: apply reminder 不再包含 worktree lifecycle 命令

- **WHEN** 主进程为 apply owner 渲染 system-reminder 文本
- **THEN** 文本包含当前 stage cwd / workspace 说明
- **AND** 文本包含 `mcp__fyllo_specs__apply-change`
- **AND** 文本不包含 `git worktree add`
- **AND** 文本不包含 `git merge --ff-only`
- **AND** 文本不包含 `git worktree remove`
- **AND** 文本不包含 `git branch -d`

#### Scenario: apply reminder 仍暴露 main fallback

- **WHEN** ApplyRunMeta.worktreePath 为 `undefined`
- **THEN** apply reminder 渲染后的 `{{worktreePath}}` 为空字符串
- **AND** 文本明确说明空字符串代表 main workspace

### Requirement: archive reminder 编排 worktree 4 步收尾

`archive.txt` system-reminder 模板正文 SHALL 不再指示 agent 手动执行 git commit / merge / worktree cleanup shell 命令。它 SHALL 指示 agent 调用 `mcp__fyllo_specs__archive-change`，传入 `confirm: true` 与匹配 `type(scope): summary` 的 `commitMessage`。

reminder SHALL 说明：

- `archive-change` 内部执行 OpenSpec archive 与 workspace git finalization。
- agent SHALL 检查返回的 `state.archive` 对象以判断 OpenSpec archive 结果。
- agent SHALL 检查返回的 `state.workspace` 对象以判断 git finalization 结果。
- 失败时，agent SHALL 汇报失败发生在 `archive` 还是 `workspace`，列出已完成的 `workspace.gitOps`，在存在时指出 `workspace.failedStep`，并转述对应子对象的 `error.retryHint`。
- 除非用户明确要求脱离 MCP workflow 进行手动恢复，agent SHALL NOT 手动执行 `git commit`、`git merge --ff-only`、`git worktree remove` 或 `git branch -d`。

#### Scenario: archive reminder 不再包含手写 git cleanup 命令

- **WHEN** 主进程为 archive owner 渲染 system-reminder 文本
- **THEN** 文本包含 `mcp__fyllo_specs__archive-change`
- **AND** 文本包含 `commitMessage`
- **AND** 文本包含 `state.archive`
- **AND** 文本包含 `state.workspace`
- **AND** 文本不包含 `git -C {{worktreePath}} add -A`
- **AND** 文本不包含 `git -C {{mainProjectPath}} merge --ff-only`
- **AND** 文本不包含 `git -C {{mainProjectPath}} worktree remove`
- **AND** 文本不包含 `git -C {{mainProjectPath}} branch -d`

#### Scenario: archive reminder 保留 archive stage 约束

- **WHEN** 主进程为 archive owner 渲染 system-reminder 文本
- **THEN** 文本仍含 `<authority>` / `<context>` / `<rules>` / `<critical>` 段
- **AND** 文本仍要求使用 `mcp__fyllo_specs__archive-change` 作为主要 archive 路径
- **AND** 文本仍要求汇报 incomplete tasks、missing artifacts、conflicts、commit result 与最终 archive outcome

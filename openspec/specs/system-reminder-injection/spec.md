# system-reminder-injection 规范

## Purpose

定义主进程在 ACP session 新建时，按 owner 分发并持久化一次性 system-reminder 的能力，以及前端对该 reminder 的隐藏约束。
## Requirements
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

### Requirement: chat reminder 编排 worktree 创建

`chat.txt` system-reminder 模板正文 SHALL 不再包含 shell-command worktree 编排序列。它 SHALL 指示 agent 在获得用户明确同意后调用 `mcp__fyllo_specs__create-proposal`，并依赖 tool 返回的 `state.workspace.path` 读取和修改所有 proposal artifacts。

reminder SHALL 同时轻量引导 project-guidelines 行为：

- 它 SHALL 提到 `fyllo-cortex.guidelines` 与 `mcp__fyllo_cortex__guidelines`，说明这是提供项目 guidelines 文件契约和维护规则的内置 tool。
- 在为代码、行为、架构、测试、工作流或约定变更创建 proposal 之前，它 SHALL 指示 agent 考虑是否需要创建或更新本地仓库 guidelines。
- 它 SHALL 不把详细 guidelines 编写规则放入 reminder。

reminder SHALL说明:

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

#### Scenario: chat reminder 将 proposal planning 引导到 guidelines tool

- **WHEN** 主进程为 chat owner 渲染 system-reminder 文本
- **THEN** 文本包含 `mcp__fyllo_cortex__guidelines`
- **AND** 文本包含 `fyllo-cortex.guidelines`
- **AND** 文本要求 agent 在为代码、行为、架构、测试、工作流或约定变更创建 proposal 前考虑是否需要创建或更新本地 guidelines
- **AND** 文本不包含完整 guideline 文档模板
- **AND** 文本不包含 legacy guidelines server name

### Requirement: apply reminder 暴露 worktreePath

`apply.txt` system-reminder 模板正文 SHALL 描述当前 stage workspace 已由 proposal workflow 准备完成。它 SHALL 使用 `{{worktreePath}}` / `{{mainProjectPath}}` 暴露当前 cwd 语义，但 SHALL NOT 指示 agent 创建、迁移、merge、remove 或删除 worktree。

reminder SHALL 同时轻量引导 project-guidelines 行为：

- 它 SHALL 提到 `fyllo-cortex.guidelines` 与 `mcp__fyllo_cortex__guidelines`，说明这是提供项目 guidelines 文件契约和维护规则的内置 tool。
- 在编辑代码前，它 SHALL 指示 agent 阅读适用的本地仓库 guidelines。
- 如果实现过程中发现 guidelines 缺失、过期或与仓库事实不一致，它 SHALL 指示 agent 在同一 change 中更新相关 guidelines。
- 它 SHALL 不把详细 guidelines 编写规则放入 reminder。

reminder SHALL说明:

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

#### Scenario: apply reminder 将实现工作引导到本地 guidelines

- **WHEN** 主进程为 apply owner 渲染 system-reminder 文本
- **THEN** 文本包含 `mcp__fyllo_cortex__guidelines`
- **AND** 文本包含 `fyllo-cortex.guidelines`
- **AND** 文本要求 agent 在编辑代码前阅读适用的本地仓库 guidelines
- **AND** 文本要求 agent 在实现过程中发现 guidelines 缺失、过期或不一致时，在同一 change 中更新它们
- **AND** 文本不包含 legacy guidelines server name

### Requirement: archive reminder 编排 worktree 4 步收尾

`archive.txt` system-reminder 模板正文 SHALL 不再指示 agent 手动执行 git commit / merge / worktree cleanup shell 命令。它 SHALL 指示 agent 调用 `mcp__fyllo_specs__archive-change`，传入 `confirm: true` 与匹配 `type(scope): summary` 的 `commitMessage`。

reminder SHALL 同时轻量引导 project-guidelines 行为：

- 它 SHALL 提到 `fyllo-cortex.guidelines` 与 `mcp__fyllo_cortex__guidelines`，说明这是提供项目 guidelines 文件契约和维护规则的内置 tool。
- 在最终 archive 前，它 SHALL 指示 agent 检查已完成 change 是否改变了命令、架构、测试、工作流、数据契约或项目约定，并因此应更新本地 guidelines。
- 它 SHALL 不把详细 guidelines 编写规则放入 reminder。

reminder SHALL说明:

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

#### Scenario: archive reminder 引导最终 guideline 检查

- **WHEN** 主进程为 archive owner 渲染 system-reminder 文本
- **THEN** 文本包含 `mcp__fyllo_cortex__guidelines`
- **AND** 文本包含 `fyllo-cortex.guidelines`
- **AND** 文本要求 agent 检查已完成 change 是否应更新本地 guidelines
- **AND** 文本不包含详细 guideline 文档模板
- **AND** 文本不包含 legacy guidelines server name

### Requirement: reminders 引导 agents 使用 guidelines tool 且不内嵌 guideline 内容

System-reminder templates SHALL 提到名为 `fyllo-cortex.guidelines` 的内置 MCP tool 可用于项目 guidelines 文件契约与维护规则；在引用 Codex-style tool function name 时 SHALL 使用 `mcp__fyllo_cortex__guidelines`。

System-reminder templates SHALL NOT 内嵌完整项目 guidelines 文档契约、guideline 模板或详细编写规则。详细 guidelines 内容 SHALL 保留在 `fyllo-cortex.guidelines` tool instruction 中。

#### Scenario: reminders 提到 guidelines tool

- **WHEN** main 进程渲染任意 owner system-reminder template
- **THEN** 渲染后的 reminder 提到 `fyllo-cortex.guidelines`
- **AND** 渲染后的 reminder 提到 `mcp__fyllo_cortex__guidelines`
- **AND** 渲染后的 reminder 说明它是项目 guidelines 文件契约和维护规则的来源
- **AND** 渲染后的 reminder 不提到旧 guidelines server route
- **AND** 渲染后的 reminder 不提到旧 Codex-style guidelines function name

#### Scenario: reminders 不重复 guidelines instruction

- **WHEN** main 进程渲染任意 owner system-reminder template
- **THEN** 渲染后的 reminder 不包含完整 guideline 文档模板
- **AND** 渲染后的 reminder 不包含详细的 `AGENTS.md` 或 `guidelines/*.md` 分章节编写说明

### Requirement: Chat reminder 注入 Fyllo action 协议

系统 SHALL 在 chat owner 的 system-reminder 中注入 `<fyllo-action>` 协议说明和已启用 action type 的 payload contract。该注入 SHALL 只影响 chat reminder，不影响 apply 或 archive reminder。

注入内容 SHALL 来自 shared Fyllo action contract 注册表，而不是在 chat reminder 模板中手写一份可能漂移的 type/payload 列表。注入内容 SHALL 至少包含：

- `<fyllo-action type="...">...</fyllo-action>` 标签格式。
- 只允许 `type` 一个 attribute。
- 已启用 action type 的精确枚举。
- 每个 action type 的严格 JSON object payload schema。
- 每个 action type 的最小合法示例。
- 禁止 Agent 定义按钮、version、id、handler、IPC channel 或额外字段。
- 指示 Agent 只在用户与 Agent 已经讨论出需要 FylloCode 端侧确认的结果后，在 assistant 可见回复中输出该标签。

若没有任何启用的 action type，chat reminder SHALL 明确指示 Agent 不得输出 `<fyllo-action>`。

#### Scenario: chat reminder 包含 task.create contract

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** reminder 文本包含 `<fyllo-action type="task.create">`
- **AND** reminder 文本包含 `task.create` 的 payload 字段 `title` 与 `description`
- **AND** reminder 文本说明 `title` 为必填非空字符串
- **AND** reminder 文本说明 `description` 为可选字符串

#### Scenario: chat reminder 禁止 Agent 自定义按钮或额外 attr

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** reminder 文本说明 `<fyllo-action>` 只允许 `type` 一个 attribute
- **AND** reminder 文本说明按钮由 FylloCode 控制，Agent 不得输出按钮文案
- **AND** reminder 文本不鼓励输出 `version`、`id`、`title` 或 `confirmLabel` attribute

#### Scenario: apply 和 archive reminder 不注入 action 协议

- **WHEN** 主进程为 apply 或 archive owner 渲染 system-reminder
- **THEN** reminder 文本不追加 chat-only 的 `<fyllo-action>` action type contract 列表

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

### Requirement: chat reminder 指导三级任务分流

系统 SHALL 在 chat owner 的 system-reminder 中注入三级任务分流规则：

- **直接实现**：适用于局部、明确、低风险、可逆，且不改变外部行为契约的任务。
- **Plan**：适用于不改变外部行为契约，但涉及多文件、多方案或需要架构取舍的任务。
- **Proposal**：适用于改变行为契约的任务，包括新增/删除 requirement、改变现有 SHALL、改变 public API surface、data schema、interface contract、storage format、用户可见默认/空态/错误态或跨模块 ownership boundary。

reminder SHALL 要求 Agent 在 Plan 过程中一旦发现会改变行为契约，停止 Plan 直接实施路径并升级为 Proposal。reminder SHALL 要求 Agent 在 Proposal 方案不清时，可以先通过 Plan 探索非最终方案，但最终契约变更仍必须沉淀为 Proposal。
reminder SHALL 要求 Agent 使用两问判定任务轨道：先判断是否改变系统行为契约，若改变则使用 Proposal；若不改变，再判断实现方式是否能从当前上下文完全确定，若需要探索和取舍则使用 Plan，否则直接实现。

#### Scenario: reminder 包含三级分流

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** 文本包含直接实现、Plan、Proposal 三类任务分流
- **AND** 文本说明 Plan 只适用于不改变外部行为契约的复杂任务
- **AND** 文本说明契约变更必须走 Proposal

#### Scenario: Plan 发现契约变更时升级

- **WHEN** Agent 正在 Plan 阶段调研
- **AND** 发现需要新增 public API surface 或改变 data schema
- **THEN** reminder 指示 Agent 停止直接实施路径
- **AND** 与用户对齐后调用 `mcp__fyllo_specs__create-proposal`

### Requirement: chat reminder 指导 create-plan 与批准后实施

系统 SHALL 在 chat owner 的 system-reminder 中说明 `mcp__fyllo_specs__create-plan` 的使用规则：

- Agent 只有在用户要求创建 plan，或 Agent 建议创建 plan 且用户同意后，才 SHALL 调用 `create-plan`。
- Agent 调用 `create-plan` 时 SHALL 只传 `goal` 与 Agent 提供的 `slug` 片段，不得传 `targetPath`、workspace path、本地文件路径或 `includeInstruction`。
- Agent 调用 `create-plan` 后 SHALL 使用 tool 返回的 `state.planPath` 写入完整 plan 文档。
- Agent 写完 plan 后 SHALL 输出 `<fyllo-action type="plan.create">`，payload 只包含 `slug` 与 `goal`，不得包含 `planPath`。
- 在 plan 被用户批准前，Agent SHALL 只做探索、分析和 plan 文档写入，SHALL NOT 修改业务代码。
- 当用户发送包含 plan slug 的 approved-plan confirmation message 后，Agent SHALL 重新读取最新 plan 文件，再按 plan 实施。

#### Scenario: reminder 禁止 planPath 进入 action payload

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** 文本说明 `plan.create` payload 不得包含 `planPath`
- **AND** 文本说明 renderer 会通过 FylloCode IPC 根据 session 和 slug 读取 plan

#### Scenario: plan 批准后允许实施

- **WHEN** 用户确认 Plan Slideover 并发送确认消息
- **THEN** reminder 指示 Agent 重新读取最新 plan
- **AND** 若 plan 不涉及行为契约变更，Agent 可以按 plan 修改代码

### Requirement: chat reminder 注入 plan.create action contract

系统 SHALL 通过 shared Fyllo action contract 注册表向 chat owner reminder 注入 `plan.create` action contract。注入内容 SHALL 来自 shared contract，而不是在 chat reminder 模板中手写一份 payload schema。

#### Scenario: chat reminder 包含 plan.create contract

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** reminder 文本包含 `<fyllo-action type="plan.create">`
- **AND** reminder 文本包含 `plan.create` 的 payload 字段 `slug` 与 `goal`
- **AND** reminder 文本说明 payload 不允许未知字段

#### Scenario: apply 和 archive reminder 不注入 plan.create contract

- **WHEN** 主进程为 apply 或 archive owner 渲染 system-reminder
- **THEN** reminder 文本不追加 chat-only 的 `plan.create` action type contract 列表

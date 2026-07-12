# fyllo-cortex-knowledge Specification

## Purpose

TBD - created by archiving change add-knowledge-tool. Update Purpose after archive.

## Requirements

### Requirement: Knowledge entries are stored as project-level app data

系统 SHALL 将 durable knowledge 条目存储在当前项目 app data 目录的 `knowledge/` 下，而不是写入仓库工作区。

每个条目 SHALL 是一个 `*.md` 文件，文件名 SHALL 等于 frontmatter `name` 加 `.md`。`name` SHALL 是 kebab-case 且不得包含路径分隔符、点号或空白字符。

每个条目 SHALL 包含 YAML frontmatter，字段包括：

- `name`
- `description`
- `type: project | reference | feedback`
- `createdAt`
- `updatedAt`
- 可选 `asOf`
- 可选 `anchors`
- 无锚点时必填 `source`

条目正文 SHALL 记录事实、原因、复用场景和会使其失效的条件。

#### Scenario: Missing knowledge directory is empty

- **WHEN** 当前项目 app data 目录不存在 `knowledge/`
- **THEN** 系统 SHALL 将 knowledge index 视为空
- **AND** 系统 SHALL NOT 将目录缺失作为错误阻断 chat system-reminder

#### Scenario: Entry filename follows frontmatter name

- **WHEN** agent 写入一个 `name` 为 `markstream-vue-theme-subscription` 的 entry
- **THEN** 系统 SHALL 将该 entry 写入 `knowledge/markstream-vue-theme-subscription.md`
- **AND** 系统 SHALL NOT 允许该 entry 写入 `knowledge/../`、子目录或任意非 `.md` 路径

#### Scenario: Filename mismatch is isolated

- **WHEN** `knowledge/wrong-name.md` 的 frontmatter `name` 为 `right-name`
- **THEN** scanner SHALL 将该文件作为 parse error 隔离
- **AND** scanner SHALL NOT 将该 entry 放入 knowledge index

#### Scenario: Unanchored entry requires source

- **WHEN** agent 起草一个没有 `anchors` 的 knowledge entry
- **THEN** 该 entry SHALL 包含 `source`
- **AND** `feedback` 类型 entry SHALL 始终包含指向用户原话的 `source`

#### Scenario: Scanner tolerates unambiguous YAML shorthand

- **WHEN** knowledge frontmatter 使用可无歧义补齐的 YAML 表达，例如未加引号的时间戳、缺失 `kind` 但包含 `file`+`hash` / `package`+`version`+`resolutionDigest` / `url`+`verifiedAt` 的 anchor，或字符串形式的 `maxAgeDays`
- **THEN** scanner SHALL 在读时规范化这些字段并将该 entry 放入 knowledge index
- **AND** scanner SHALL NOT 将规范化结果自动写回 knowledge markdown 文件
- **AND** scanner SHALL 继续拒绝 filename/frontmatter `name` mismatch、非法 hash、路径逃逸、缺失 `source` 的无锚点条目或无法无歧义推断的 anchor

### Requirement: Knowledge anchors determine computed status

系统 SHALL 通过 knowledge entry 的 anchors 计算条目状态，状态 SHALL 为 `active`、`suspect` 或 `unknown`。

`file` anchor SHALL 记录写入时文件内容的 SHA-256 digest。`package` anchor SHALL 记录解析后的 package version 和该 package resolution entry 的 SHA-256 `resolutionDigest`。`url` anchor SHALL 记录 `verifiedAt` 和可选 `maxAgeDays`，缺省 freshness window 为 90 天。

`asOf` SHALL 只作为 provenance，不得用于判断条目是否过期。

#### Scenario: File anchor content changed

- **WHEN** knowledge entry 的 `file` anchor 指向的文件当前 SHA-256 与 frontmatter `hash` 不同
- **THEN** 系统 SHALL 将该 entry 的 computed status 标为 `suspect`
- **AND** 系统 SHALL 在 state 中标明触发 suspect 的 anchor

#### Scenario: Anchor cannot be verified

- **WHEN** knowledge entry 的 anchor 无法验证，例如文件不可读或 lockfile 无法解析
- **THEN** 系统 SHALL 将该 entry 的 computed status 标为 `unknown`
- **AND** 系统 SHALL NOT 将该 entry 标为 `suspect`

#### Scenario: Package anchor digest changed

- **WHEN** knowledge entry 的 `package` anchor 指向的 pnpm lockfile package entry 当前 digest 与 frontmatter `resolutionDigest` 不同
- **THEN** 系统 SHALL 将该 entry 的 computed status 标为 `suspect`
- **AND** 系统 SHALL NOT 通过 registry integrity 字符串包含关系判断 package anchor 是否仍 active

#### Scenario: Unanchored entry is audit-exempt

- **WHEN** knowledge entry 没有 anchors 且包含合法 source
- **THEN** 系统 SHALL NOT 对该 entry 执行 anchor staleness 检查
- **AND** 系统 SHALL NOT 因仓库中找不到证据而自动 suspect 或 retire 该 entry

### Requirement: Chat reminders inject a compact knowledge index

系统 SHALL 在 Chat system-reminder 中注入 `<knowledge>` 块，供 agent 了解当前项目 durable knowledge index 和 flag 规则。

`<knowledge>` 块 SHALL 包含：

- knowledge root 的读取位置；
- knowledge 是记录和证据而非 live instruction 的说明；
- 读取 `suspect` 或 `unknown` 条目前必须验证的说明；
- flag test 和常见触发线索；
- 按 `project`、`reference`、`feedback` 分组的紧凑索引；

索引项 SHALL 只包含 `name`、`description` 和可选 status marker，不注入完整 anchors/source/body。

#### Scenario: Active entry appears without status marker

- **WHEN** Chat system-reminder 构建 knowledge index，且某条 entry computed status 为 `active`
- **THEN** `<knowledge>` 块 SHALL 展示该 entry 的 `name` 和 `description`
- **AND** 该 index 行 SHALL NOT 附加 `suspect` 或 `unknown` 标记

#### Scenario: Suspect entry appears with marker

- **WHEN** Chat system-reminder 构建 knowledge index，且某条 entry computed status 为 `suspect`
- **THEN** `<knowledge>` 块 SHALL 在该 index 行展示 `[suspect]`
- **AND** reminder SHALL 要求 agent 在依赖该条目前验证当前事实

#### Scenario: User-authored text is escaped

- **WHEN** knowledge frontmatter `description` 或其他注入字段包含 `<` 或 `>`
- **THEN** system-reminder SHALL 将尖括号编码为 JSON-safe escape
- **AND** 该文本 SHALL NOT 能关闭 `<knowledge>`、`<system-reminder>` 或 `<fyllo-action>` 标签

### Requirement: Knowledge flag action records low-cost candidates

系统 SHALL 支持 `knowledge.flag` Fyllo Action，用于记录尚未审阅的 knowledge 候选。

`knowledge.flag` payload SHALL 是严格 JSON object，包含必填 `summary` 和可选 `contextPaths`。`summary` SHALL 是一句话，说明候选事实以及为什么不可廉价推断。`contextPaths` SHALL 是项目相对路径数组。

`knowledge.flag` SHALL 是 `presentation=rail`、`interaction=confirm` 的 action：它 SHALL 出现在 EventRail 中，但 EventRail SHALL 只提供展示和定位，不提供 capture、confirm 或沉淀操作按钮。inline Fyllo Action shell SHALL 通过普通确认/取消按钮提供操作。确认该 action SHALL 触发 capture 流程，取消该 action SHALL 只记录 action state；两者都 SHALL NOT 直接写入 knowledge 文件。

#### Scenario: Assistant emits a flag and continues working

- **WHEN** assistant 在回复中输出合法 `<fyllo-action type="knowledge.flag">`
- **THEN** renderer SHALL 能解析该 action
- **AND** 该 action SHALL 像其他 confirm action 一样展示操作按钮，但不要求用户立即确认
- **AND** assistant MAY 在同一回复中继续输出普通文本或继续执行后续工具调用

#### Scenario: EventRail derives flags from renderer-parsed messages

- **WHEN** 当前 active session 已加载的 assistant message 包含合法 `knowledge.flag`
- **THEN** EventRail SHALL 通过 renderer 侧 Fyllo Action parsing 得到该 candidate
- **AND** 系统 SHALL NOT 要求 main 为 `knowledge.flag` 写入专门的 session meta 投影
- **AND** EventRail 的 candidate 范围 SHALL 以当前 active session 已加载消息为准

#### Scenario: Invalid flag payload is ignored as a candidate

- **WHEN** assistant 输出的 `knowledge.flag` payload 不符合 schema
- **THEN** renderer SHALL 将该 inline action 按现有 invalid action 呈现或忽略为不可处理项
- **AND** 该 action SHALL NOT 进入 EventRail pending action 列表

### Requirement: Users trigger capture by confirming knowledge flags

系统 SHALL 在 Chat EventRail 中展示当前 active session 已加载消息里的未处理 knowledge flags，但 EventRail SHALL 保持只读列表形态，不提供 capture 操作按钮。

确认任意 inline pending `knowledge.flag` action，SHALL 对当前已加载会话里的全部未处理 knowledge flags 组装一条 capture 用户消息。发送 SHALL 遵守 Chat prompt 的统一发送条件；assistant 正在回复时不得发送。

#### Scenario: EventRail shows pending flags

- **WHEN** 当前 active session 已加载 assistant messages 中至少包含一个合法、未处理的 `knowledge.flag`
- **THEN** EventRail SHALL 展示 knowledge flag 分组或条目
- **AND** 每个条目 SHALL 展示 summary 或可读回退文本
- **AND** EventRail 条目 SHALL NOT 展示 capture、confirm 或沉淀按钮

#### Scenario: Inline capture trigger includes all pending flags

- **WHEN** 用户确认当前会话任意 inline pending `knowledge.flag` action
- **THEN** 系统 SHALL 发送一条 capture 用户消息
- **AND** 该消息 SHALL 包含当前已加载会话中的所有 pending knowledge flags
- **AND** 系统 SHALL NOT 只发送被点击的单个 flag
- **AND** 发送成功后，同批 pending knowledge flag actions SHALL 通过现有 Fyllo Action state 机制标记为 `succeeded`
- **AND** 系统 SHALL NOT 为 knowledge flags 新增专门的 session meta 投影字段

#### Scenario: Capture message separates hidden instructions from visible text

- **WHEN** 系统发送 knowledge capture 用户消息
- **THEN** message parts SHALL 包含两个 text parts
- **AND** 第一个 text part SHALL 是完整 `<system-reminder>...</system-reminder>`，并在 renderer 对话流中隐藏
- **AND** 第一个 text part SHALL 提示 agent 调用 `mcp__fyllo_cortex__knowledge({ "mode": "capture" })` 获取 capture instruction
- **AND** 第一个 text part SHALL 只携带候选 `summary` 和可选 `contextPaths`
- **AND** 第一个 text part SHALL NOT 包含 Fyllo Action `actionId`
- **AND** 第二个 text part SHALL 是用户可见的自然语言请求
- **AND** 第二个 text part SHALL NOT 暴露 FylloCode 内部术语、tool 名、payload 或 action id

#### Scenario: Inline flag confirmation triggers capture

- **WHEN** 用户确认一个 inline `knowledge.flag` action
- **THEN** 系统 SHALL 复用统一 capture trigger 逻辑发送 capture 用户消息
- **AND** 该消息 SHALL 包含当前已加载会话中的所有 pending knowledge flags
- **AND** 系统 SHALL NOT 直接写入、更新或删除 knowledge entry

#### Scenario: Capture cannot start while assistant is responding

- **WHEN** 当前 chat status 不是可发送状态
- **THEN** inline flag confirmation SHALL 拒绝发送 capture 用户消息
- **AND** 系统 SHALL NOT 创建新的 capture 用户消息

### Requirement: Knowledge tool provides capture, update, retire, and audit modes

`fyllo-cortex` SHALL 提供 `knowledge` MCP tool，支持 `capture`、`update`、`retire`、`audit` 四个 mode。

Tool input SHALL 使用 strict schema。`update` 和 `retire` mode SHALL 要求 `name` 和 `reason`。`includeInstruction` SHALL 默认 true，并且首次调用 SHALL 返回 mode-specific `tool_instruction` 与 `state`。

Tool SHALL NOT 提供 flag mode。Tool SHALL 返回 `knowledgeRoot`，供 agent 按 instruction 直接创建、更新或删除 knowledge markdown 文件。Tool SHALL NOT 作为读取 knowledge entry 正文的主要入口；agent 应根据 `<knowledge>` index 或 tool state 中的 root path 直接读取文件。

#### Scenario: Capture mode returns index state

- **WHEN** agent 因用户发送的 capture 消息调用 `knowledge` tool 且 `mode` 为 `capture`
- **THEN** tool SHALL 返回当前 knowledge index
- **AND** tool SHALL 返回 capture instruction，指导 agent 查重、准入测试、验证、撰写 entry、写入 markdown 文件并输出 `knowledge.review`

#### Scenario: Update mode requires target

- **WHEN** agent 调用 `knowledge` tool 且 `mode` 为 `update` 但未提供 `name` 或 `reason`
- **THEN** tool SHALL 返回 schema validation error
- **AND** tool SHALL NOT 返回误导性的 target state

#### Scenario: Audit mode lists non-active entries

- **WHEN** agent 调用 `knowledge` tool 且 `mode` 为 `audit`
- **THEN** tool SHALL 返回完整 knowledge index、computed status 和触发 status 的 anchor 信息
- **AND** tool instruction SHALL 要求 audit 只在用户发起维护时执行

### Requirement: Knowledge review action opens raw markdown review

系统 SHALL 支持 `knowledge.review` Fyllo Action，用于让用户审阅 agent 已写入或更新的 knowledge markdown 文件。

`knowledge.review` payload SHALL 是严格 JSON object，包含：

- 必填 `name`：kebab-case knowledge entry name，用于定位 `knowledge/<name>.md`；
- 可选 `summary`：展示给用户的审阅摘要。

Payload 中所有字符串 SHALL 不能通过字面 `</fyllo-action>` 截断 action tag；输出到 prompt contract 的说明 SHALL 要求 agent 将尖括号编码为 `\u003c` 和 `\u003e`。

#### Scenario: Review opens raw markdown from disk

- **WHEN** 用户确认一个 `name` 为 `markstream-vue-theme-subscription` 的 `knowledge.review`
- **THEN** renderer SHALL 打开 knowledge review slideover
- **AND** slideover SHALL 通过 `insight:knowledge:readEntry` 读取 `knowledge/markstream-vue-theme-subscription.md`
- **AND** 编辑器 SHALL 展示该 markdown 文件的完整原文，包括 YAML frontmatter 和 body

#### Scenario: Review saves raw markdown without frontmatter preprocessing

- **WHEN** 用户在 knowledge review slideover 中修改文本
- **THEN** renderer SHALL 通过 `insight:knowledge:saveEntry` 实时保存完整 markdown 原文
- **AND** main SHALL NOT 解析、重组、排序或删除 frontmatter 字段
- **AND** 保存路径 SHALL 只允许 `knowledge/<name>.md`

#### Scenario: Review confirmation only completes action state

- **WHEN** 用户在 knowledge review slideover 中点击确认
- **THEN** slideover SHALL 先保存当前编辑器内容
- **AND** confirm handler SHALL 返回 succeeded
- **AND** 现有 Fyllo Action state 机制 SHALL 将该 review action 记录到 session meta
- **AND** main SHALL NOT 在确认阶段执行 capture、discard、update 或 retire operation

#### Scenario: Missing review entry reports load error

- **WHEN** 用户打开 `knowledge.review` 但目标 `knowledge/<name>.md` 不存在
- **THEN** slideover SHALL 显示明确加载错误
- **AND** 系统 SHALL NOT 创建空 entry 文件

### Requirement: Knowledge admission protects quality and authority boundaries

系统 SHALL 在 capture instruction 中要求 agent 对每个 candidate 执行准入测试。只有全部通过的 candidate 才能被 agent 写入 app data knowledge markdown，并通过 `knowledge.review` 的 `name` payload 进入用户审阅。

准入测试 SHALL 至少覆盖：

- 不可廉价推断或推导成本高；
- 有现实复用场景；
- 类型和所有权正确；
- 已验证或可由用户 attribution 验证；
- 调试产物在修复后仍为真，或没有更紧凑的现有制品可承载。

Knowledge SHALL 被视为记录和证据，不是 live instruction。Knowledge 与 OpenSpec spec 或 repository guidelines 冲突时，agent SHALL 报告冲突，而不是静默使用 knowledge 覆盖更高权威。

#### Scenario: Candidate already covered by guideline

- **WHEN** capture instruction 发现 candidate 是 agent 自行推导出的项目规范
- **THEN** agent SHALL 将其路由到 guidelines 维护流程
- **AND** agent SHALL NOT 将其作为 knowledge entry 发布

#### Scenario: User lasting directive becomes feedback

- **WHEN** candidate 是用户发出的、超出当前任务仍适用的长期指令或纠正
- **THEN** agent SHALL 将 entry type 设为 `feedback`
- **AND** entry SHALL 记录用户给出的 rationale 或原话出处

#### Scenario: Temporary override is not revocation

- **WHEN** 用户在当前任务中临时要求偏离某条 feedback entry
- **THEN** agent SHALL 遵守用户当前指令
- **AND** 系统 SHALL NOT 自动 retire 或 update 该 feedback entry

### Requirement: Knowledge failures are isolated

系统 SHALL 隔离 knowledge 读取、解析、注入和 review 写入失败，避免单条损坏或单项失败破坏整个 chat workflow。

#### Scenario: Broken entry does not block reminders

- **WHEN** `knowledge/` 中某个 entry frontmatter 损坏
- **THEN** system-reminder 构建 SHALL 跳过或标记该 entry
- **AND** system-reminder SHALL 继续注入其他可读取 entries

#### Scenario: Knowledge index scan failure does not block chat

- **WHEN** knowledge index 扫描整体失败
- **THEN** Chat system-reminder SHALL 省略 `<knowledge>` 块或注入安全降级提示
- **AND** 系统 SHALL NOT 阻止用户发送 chat message

#### Scenario: Knowledge review save failure keeps editor open

- **WHEN** knowledge review slideover 保存 markdown 原文失败
- **THEN** slideover SHALL 显示保存错误并保持打开
- **AND** confirm handler SHALL NOT 返回 succeeded

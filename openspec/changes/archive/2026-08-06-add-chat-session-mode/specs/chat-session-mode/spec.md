## ADDED Requirements

### Requirement: 新 Chat 会话提供两种固定模式

系统 SHALL 为尚未创建 Session 的 Chat draft 提供 `fyllocode` 与 `native` 两种会话模式，并 SHALL 默认选择 `fyllocode`。模式 SHALL 在真实 Session 创建时持久化，此后该 Session 的全部 prompt、resume、load 与 fresh fallback SHALL 使用同一模式；系统 SHALL NOT 提供修改既有 Session 模式的接口。

#### Scenario: 新 draft 使用默认模式

- **WHEN** 用户进入新的 Chat draft 且尚未选择模式
- **THEN** Renderer SHALL 选择 `fyllocode`
- **AND** 首次提交 SHALL 以 `fyllocode` 创建 Session

#### Scenario: 用户选择原生模式后首发

- **WHEN** 用户在首条消息前选择 `native` 并提交非空消息
- **THEN** 新 Session SHALL 持久化 `native`
- **AND** 后续 turn SHALL 继续按 `native` 执行

#### Scenario: 历史 Session 缺少模式

- **WHEN** Main 读取一个没有合法 `sessionMode` 字段的历史 Session meta
- **THEN** 系统 SHALL 将其归一化为 `fyllocode`
- **AND** SHALL NOT 要求一次性数据迁移

#### Scenario: Renderer 尝试在后续 turn 覆盖模式

- **WHEN** 已有 Session 发送后续 prompt
- **THEN** Main SHALL 只使用持久化 Session mode
- **AND** stream/update IPC SHALL NOT 接受可修改该 mode 的字段

### Requirement: Draft probe 按模式复用或替换

Main SHALL 在同一 `workspaceId + agentId` 下只保留一个有效 draft probe，并 SHALL 将 `sessionMode` 纳入 probe identity。目标模式与现有 probe 相同时 SHALL 复用现有 ready/starting probe；模式不同时 SHALL 通过现有 `closeProbe` 路径移除旧 entry、解除 handler、撤销 MCP activation并关闭 ready ACP session，再创建目标模式 probe。系统 SHALL NOT 同时缓存两种模式的 probe。

#### Scenario: 相同模式重复 ensure

- **WHEN** 同一 Workspace、Agent 与 mode 的 probe 已 ready或 starting
- **THEN** `probeEnsure` SHALL 复用该 entry或 inflight ensure
- **AND** SHALL NOT 创建第二个 ACP session

#### Scenario: FylloCode 切换为原生

- **WHEN** 当前 probe mode 为 `fyllocode` 且用户选择 `native`
- **THEN** Main SHALL 使旧 probe 失效并复用现有清理路径
- **AND** SHALL 只为 `native` 创建新的有效 probe

#### Scenario: 失效 probe 在 newSession 后返回

- **WHEN** 模式切换发生时旧 probe 的 ACP `newSession` 尚未返回
- **THEN** 旧 entry SHALL 先从 registry 移除
- **AND** 旧 `newSession` 返回后 SHALL 撤销 activation、解除 handler并关闭该 ACP session
- **AND** SHALL NOT 覆盖目标模式 probe

#### Scenario: 快速往返切换

- **WHEN** 用户在 probe 启动期间多次切换模式
- **THEN** Renderer SHALL 只接受当前 Workspace、Agent 与 mode 的 probe update
- **AND** Main SHALL 最终只保留最后目标 mode 的一个 probe

### Requirement: Probe promotion 必须匹配 Session 模式

Probe promotion SHALL 同时匹配 `workspaceId`、`agentId`、`acpSessionId` 与 `sessionMode`。Session 创建与首轮 stream consume SHALL 拒绝 mode 不匹配或已失效的 probe，且 SHALL NOT 通过只匹配 ACP session ID 绕过 mode 校验。

#### Scenario: 匹配模式的 ready probe 被提升

- **WHEN** 首次提交 mode 与 ready probe 的 mode 相同且其他 identity 均匹配
- **THEN** Chat Session SHALL 继承该 probe 的 ACP session、config options与 available commands
- **AND** SHALL NOT 重新创建 ACP session

#### Scenario: Probe 模式与 Session 模式不匹配

- **WHEN** create或stream请求引用的 probe mode 与持久化 Session mode 不同
- **THEN** Main SHALL 返回结构化 validation error
- **AND** SHALL NOT consume或提升该 probe

### Requirement: FylloCode 模式启用协作运行环境

`fyllocode` Chat/probe SHALL 使用固定 Session Workspace snapshot 的 `cwd` 与 `additionalDirectories`，为 ACP lifecycle 创建 bundled MCP activation，并在 brand-new ACP session 的首个 prompt 前按现有规则注入 FylloCode system reminder。Cold recovery 进入 fresh fallback时 SHALL 继续按现有规则注入一次 system reminder 与 persisted history reminder。

#### Scenario: FylloCode probe 创建 ACP session

- **WHEN** `fyllocode` draft probe 调用 ACP `newSession`
- **THEN** request SHALL 携带当前固定 Workspace snapshot的目录集合
- **AND** SHALL 携带按 Agent能力选择的 bundled MCP specs

#### Scenario: FylloCode 首轮 prompt

- **WHEN** `fyllocode` Chat 使用 brand-new或 promoted ACP session发送首轮 prompt
- **THEN** prompt SHALL 在用户内容前包含一次完整 FylloCode system reminder

### Requirement: 原生模式不扩展 Agent 行为

`native` Chat/probe SHALL 继续使用固定 Session Workspace snapshot 的 `cwd`、`additionalDirectories` 与 Agent原生 session config options，但 ACP lifecycle的 `mcpServers` SHALL为空。Main SHALL NOT 为该 activation等待 bundled MCP readiness、创建 descriptor、签发 HTTP grant、生成 stdio MCP spec、调用 Chat system-reminder provider或注入 persisted history reminder。

#### Scenario: 原生 probe 创建 ACP session

- **WHEN** `native` draft probe调用 ACP `newSession`
- **THEN** request SHALL携带固定 Workspace目录集合
- **AND** `mcpServers` SHALL为空
- **AND** Main SHALL NOT 创建 bundled MCP activation

#### Scenario: 原生首轮 prompt

- **WHEN** `native` Chat在 brand-new或 promoted ACP session发送首轮 prompt
- **THEN** ACP prompt SHALL只包含用户提交的 prompt parts
- **AND** SHALL NOT持久化隐藏的 FylloCode reminder part

#### Scenario: 原生 fresh fallback

- **WHEN** `native` Session无法 resume或load且 recovery创建 fresh ACP session
- **THEN** 系统 SHALL继续恢复 Agent支持的 session config options
- **AND** SHALL NOT注入 FylloCode system reminder或 persisted history reminder

### Requirement: 新会话和既有会话使用不同模式控件

Renderer SHALL 只在没有 active Session 时，于 Chat 输入框上方展示内容宽度自适应、带边框的 `FylloCode` / `原生` Tabs；每个选项 SHALL 在 hover与 keyboard focus时通过 tooltip展示说明。Session建立后 SHALL隐藏 Tabs，并在 Chat Header左栏现有 sidebar toggle与 new-session icon button之后展示 `color=neutral`、低强调的圆角 mode badge及相同 tooltip。ChatSidebar与 SessionItem SHALL NOT展示模式。

#### Scenario: 新会话显示模式 Tabs

- **WHEN** Chat处于 draft且没有 active Session
- **THEN** 输入框上方 SHALL显示默认选中 `FylloCode`的紧凑 Tabs
- **AND** Tabs容器 SHALL按内部内容宽度布局而不占满整行

#### Scenario: 模式说明文案

- **WHEN** 用户 hover或聚焦 `FylloCode`选项或 badge
- **THEN** tooltip SHALL显示 `结合项目规范、规约与知识，按 FylloCode 工作流程协作并沉淀成果。`
- **AND WHEN** 用户 hover或聚焦 `原生`选项或 badge
- **THEN** tooltip SHALL显示 `保持 Agent 默认的工作方式，不做改变。`

#### Scenario: 已创建会话显示低强调 badge

- **WHEN** 用户打开一个已创建 Session
- **THEN** Header左侧 SHALL在现有 icon button之后显示该 Session的模式文字
- **AND** badge SHALL使用 neutral状态样式而非 primary强调
- **AND** 页面 SHALL NOT显示“发送首条消息后锁定”或等价提示

#### Scenario: 会话列表保持简洁

- **WHEN** ChatSidebar展示任意 Session列表
- **THEN** Session条目 SHALL NOT增加 mode badge、mode文案或 mode筛选

### Requirement: 非 Chat ACP owner 不受会话模式影响

Proposal Apply、Archive以及其他由 FylloCode内部创建的非 Chat ACP session SHALL继续使用各自现有的 owner-only Workspace descriptor、bundled MCP activation与 system reminder contract，且 SHALL NOT读取 Chat Session mode。

#### Scenario: Apply activation

- **WHEN** 系统为 proposal Apply启动 ACP session
- **THEN** activation SHALL继续绑定 owner-only bundled MCP与 Apply reminder
- **AND** SHALL NOT因任何 Chat draft或 Session mode退化为 native

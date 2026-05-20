# session-management 规范

## Purpose

Session 管理定义了 Chat 左侧边栏中 session 列表的展示、新建、选择和操作行为。

## Requirements

### Requirement: Sessions 标签列出所有项目 session

系统 SHALL 在左侧边栏的"Sessions"标签中显示 session 列表，按最新优先排序，最新 session 在顶部。session 列表 SHALL 从磁盘持久化存储中加载，而非使用 mock 数据。

每个 session 条目 SHALL 显示标题、时间戳、轮次数、状态指示器，以及与该 session `agentId` 对应的 ACP agent icon，用于在进入会话前识别该 session 绑定的 agent。

在 chat 侧栏的窄宽度下，session 条目 SHALL 采用 `Conversation-first` 的视觉层级：标题 SHALL 作为主视觉元素显示在条目正文的第一行；时间戳与轮次数 SHALL 以较低强调度显示在第二行；agent icon SHALL 作为辅助身份标识保留在条目主内容区域的前导位置，而不是成为比标题更强的视觉焦点。

状态指示器 SHALL 继续显示，但 SHALL 与前导媒体区合并为单一前导锚点。系统 SHALL NOT 再使用“独立状态点列 + agent icon 列”的双前导结构，以避免在窄侧栏中稀释标题的识别优先级。

当 `useAcpAgentsStore.icons` 中存在该 `agentId` 对应 icon 时，session 条目 SHALL 渲染该 icon；当 `agentId` 未命中 icon、icon 尚未加载完成或 registry 不可用时，session 条目 SHALL 保留固定尺寸的前导占位，并继续正常显示其余会话信息，不得报错或导致条目布局塌缩。

session 列表的视觉编排 SHALL 更接近块状导航项，而不是依赖强分隔线的表格式列表；但这类样式调整 SHALL NOT 改变排序、数据字段、点击选择或会话创建语义。

#### Scenario: Session 列表已填充

- **WHEN** 项目存在已有 session
- **THEN** 列表显示每个 session 的标题、时间戳、轮次数、状态指示器和 agent icon
- **AND** 每个条目以标题作为第一视觉焦点

#### Scenario: Session 标题截断

- **WHEN** session 标题超过一行
- **THEN** 标题以省略号截断
- **AND** 第二行元信息与前导媒体区仍保持稳定对齐

#### Scenario: 切换项目时刷新 session 列表

- **WHEN** 用户切换到另一个项目
- **THEN** session 列表清空并重新从磁盘加载该项目的 session 列表

#### Scenario: Session 的 agent icon 可解析时显示对应图标

- **WHEN** 某个 session 的 `agentId` 在 `useAcpAgentsStore.icons` 中存在对应 icon
- **THEN** 该 session 条目显示该 agent icon
- **AND** 图标作为会话级辅助身份标识显示在条目主内容区域的前导位置
- **AND** 条目左侧不存在与该图标并列的独立状态点列

#### Scenario: Session 的 agent icon 不可解析时保持稳定占位

- **WHEN** 某个 session 的 `agentId` 在 `useAcpAgentsStore.icons` 中不存在对应 icon，或 icon 尚未加载完成
- **THEN** 该 session 条目不抛错
- **AND** 条目仍显示标题、时间戳、轮次数和状态指示器
- **AND** agent icon 位置保留固定尺寸占位，不因缺失而改变条目整体对齐

#### Scenario: 运行中的 session 仍可感知状态

- **WHEN** 某个 session 的 `status` 为 `running`
- **THEN** 用户仍能从条目的前导媒体区感知该 session 正在运行
- **AND** 该状态提示不额外占用独立前导列

### Requirement: 新建 Session 按钮进入空白草稿态

系统 SHALL 在 Sessions 标签顶部提供"新建 Session"按钮。点击后，系统 SHALL 进入空白草稿态，而不是立即创建并持久化新的 session。

#### Scenario: 点击新建进入草稿态

- **WHEN** 用户点击"新建 Session"按钮
- **THEN** `activeSessionId` 被清空，session 列表中没有任何条目处于选中状态
- **AND** Chat 区域显示无历史消息的空白输入态
- **AND** session 列表不新增条目
- **AND** 磁盘上不生成新的 session 元数据文件

### Requirement: Session 条目支持选择和操作

系统 SHALL 高亮当前选中的 session，并在悬停时显示更多操作菜单（重命名、删除）。选择 session 时 SHALL 从磁盘加载该 session 的历史消息。

#### Scenario: 选择 session 并加载历史消息

- **WHEN** 用户点击 session 条目
- **THEN** 该 session 以高亮背景被选中，其历史消息从磁盘加载并显示在 Chat 区域
- **AND** 若 session 元数据包含 `tokenUsage`，则恢复该值到 session 对象
- **AND** 若 session 元数据的 `tokenUsage` 包含 `cost`，则恢复 `cost` 到 session 对象

#### Scenario: 已加载消息的 session 不重复加载

- **WHEN** 用户切换到一个已加载过消息的 session
- **THEN** 直接显示已有消息，不重新从磁盘读取

#### Scenario: Session 更多操作菜单

- **WHEN** 用户悬停在 session 条目上并点击三点菜单
- **THEN** 下拉菜单出现，包含重命名或删除 session 的选项

### Requirement: 草稿态首条消息懒创建并持久化 session

系统 SHALL 在用户从草稿态发送第一条消息时，先创建并持久化真实 session，再将该条消息作为会话起点写入磁盘并显示在 UI 中。

#### Scenario: 草稿态首条消息创建新 session

- **WHEN** 用户在草稿态发送第一条消息
- **THEN** 系统创建新的 session 元数据文件，标题初始化为基于首条用户消息生成的兜底标题
- **AND** 新 session 插入 session 列表顶部并设为当前选中项
- **AND** 首条用户消息写入该 session 的消息文件
- **AND** session 元数据中 `tokenUsage` 初始化为 `{ used: 0, size: 0 }`
- **AND** `tokenUsage.cost` 初始为 `undefined`

#### Scenario: 首条消息使用发送瞬间的草稿态上下文

- **WHEN** 用户在草稿态点击发送第一条消息
- **THEN** 系统使用点击发送瞬间的 `projectId`、当前所选 `draftAgentId` 与输入内容作为创建与发送上下文
- **AND** 新 session 的 `agentId` 与该次发送时的 `draftAgentId` 一致

#### Scenario: 首条消息与后续流式链路复用同一 sessionId

- **WHEN** 草稿态首条消息成功创建新 session
- **THEN** 首条用户消息持久化、后续 `streamMessage` 流式响应、以及该轮对话中的标题更新链路，均使用同一个新建 session 的 `sessionId`

#### Scenario: 创建失败时不留下半创建状态

- **WHEN** 用户在草稿态发送第一条消息，但 `createSession` 在首条消息持久化前失败
- **THEN** session 列表不新增条目
- **AND** 磁盘上不生成新的 session 或消息文件
- **AND** 系统保持在草稿态，而不是进入半创建的会话状态

### Requirement: Session 标题具备本地兜底与 Agent 覆盖能力

系统 SHALL 在真实 session 创建时，使用首条用户消息生成本地兜底标题；当 ACP agent 在对话过程中推送 `session_info_update` 事件且包含 `title` 字段时，系统 SHALL 用该值覆盖当前标题并持久化到磁盘。

#### Scenario: 新 session 使用首条消息兜底标题

- **WHEN** 用户在草稿态发送第一条消息并创建 session
- **THEN** session 标题初始显示为对首条消息执行去首尾空白、压缩连续空白后的前 30 个字符

#### Scenario: Agent 未推送标题时保留兜底标题

- **WHEN** 新 session 创建后，ACP agent 未推送任何 `session_info_update`
- **THEN** session 标题保持为首条消息生成的兜底标题

#### Scenario: Agent 推送标题后更新

- **WHEN** ACP agent 推送 `session_info_update` 事件且 `title` 字段非空
- **THEN** session 标题更新为 agent 推送的值，并持久化到磁盘元数据文件

### Requirement: Session 重命名和删除同步到磁盘

系统 SHALL 在用户重命名或删除 session 时，将变更同步持久化到磁盘。

#### Scenario: 重命名 session

- **WHEN** 用户通过菜单重命名 session
- **THEN** 新标题写入磁盘 session 元数据文件

#### Scenario: 删除 session

- **WHEN** 用户通过菜单删除 session
- **THEN** 磁盘上对应的元数据文件和消息文件均被删除

### Requirement: Session 加载恢复可用命令

系统 SHALL 在从磁盘 session meta 加载 session 列表或 session 信息时，恢复持久化的 agent 可用命令列表。主进程读取 session meta 的 `available_commands` 字段后 SHALL 通过 IPC 返回为 `Session.availableCommands`，renderer SHALL 在 `normalizeSession` 后保留该字段。

#### Scenario: Session 列表加载时恢复 availableCommands

- **WHEN** 项目内某 session meta 包含 `available_commands: [{ name: "review", description: "Review code" }]`
- **THEN** `chat:listSessions` 返回的对应 `Session.availableCommands` 为同一命令列表
- **AND** `useSessionStore.loadSessions` 后该 session 对象保留 `availableCommands`

#### Scenario: 选择 session 后命令回显

- **WHEN** 用户选择一个已经从 session meta 恢复 `availableCommands` 的 session
- **THEN** `activeSession.availableCommands` 为该 session 自身字段
- **AND** ChatContainer 的 slash 命令按钮和菜单按该字段回显

#### Scenario: 缺失字段保持兼容

- **WHEN** 历史 session meta 不包含 `available_commands`
- **THEN** `chat:listSessions` 返回的对应 `Session.availableCommands` 为 `undefined`
- **AND** renderer 加载与选择该 session 不抛错

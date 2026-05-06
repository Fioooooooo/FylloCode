# session-management 规范

## Purpose

Session 管理定义了 Chat 左侧边栏中 session 列表的展示、新建、选择和操作行为。

## Requirements

### Requirement: Sessions 标签列出所有项目 session

系统 SHALL 在左侧边栏的"Sessions"标签中显示 session 列表，按最新优先排序，最新 session 在顶部。session 列表 SHALL 从磁盘持久化存储中加载，而非使用 mock 数据。

#### Scenario: Session 列表已填充

- **WHEN** 项目存在已有 session
- **THEN** 列表显示每个 session 的标题、时间戳、轮次数和状态指示器

#### Scenario: Session 标题截断

- **WHEN** session 标题超过一行
- **THEN** 标题以省略号截断

#### Scenario: 切换项目时刷新 session 列表

- **WHEN** 用户切换到另一个项目
- **THEN** session 列表清空并重新从磁盘加载该项目的 session 列表

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

## MODIFIED Requirements

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

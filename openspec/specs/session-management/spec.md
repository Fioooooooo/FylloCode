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

系统 SHALL 高亮当前选中的 session，并在悬停、键盘聚焦或更多菜单打开时显示更多操作菜单（修改标题、删除）。选择 session 时 SHALL 从磁盘加载该 session 的历史消息；如果该 session 已在内存中加载过消息，则直接显示内存中的最新消息。选择 session SHALL NOT 停止、取消或失效其他 session 的运行中 stream，也 SHALL NOT 阻止其他 session 后台接收后续 stream 回调。

Session 条目在正常状态下 SHALL NOT 为默认隐藏的更多操作按钮永久保留固定右侧空白；标题区域 SHALL 使用前导媒体区和元信息之外的剩余横向空间进行单行截断。更多操作按钮出现时 SHALL 保持可点击和可识别，但不得通过扩大 chat sidebar 宽度实现。

#### Scenario: 选择 session 并加载历史消息

- **WHEN** 用户点击 session 条目
- **THEN** 该 session 以高亮背景被选中，其历史消息从磁盘加载并显示在 Chat 区域
- **AND** 若 session 元数据包含 `tokenUsage`，则恢复该值到 session 对象
- **AND** 若 session 元数据的 `tokenUsage` 包含 `cost`，则恢复 `cost` 到 session 对象

#### Scenario: 已加载消息的 session 不重复加载

- **WHEN** 用户切换到一个已加载过消息的 session
- **THEN** 直接显示已有消息，不重新从磁盘读取
- **AND** 若该 session 在后台 stream 期间已更新内存消息，则显示该内存最新状态

#### Scenario: 切换到其他 session 不停止后台 stream

- **WHEN** session A 的 `status` 为 `running`
- **AND** 用户点击 session B 条目
- **THEN** `activeSessionId` 切换为 session B
- **AND** session A 的运行中 stream 不被取消
- **AND** session A 后续收到的 stream chunk 继续更新 session A 的内存态

#### Scenario: 切回后台完成的 session

- **WHEN** 用户从 session A 切到 session B 后，session A 在后台收到 done 并更新为 `ended`
- **AND** 用户再次点击 session A
- **THEN** Chat 区域显示 session A 在后台接收完成后的内存消息
- **AND** session A 不因已加载而丢失后台接收的 assistant 内容

#### Scenario: Session 更多操作菜单

- **WHEN** 用户悬停在 session 条目上并点击三点菜单
- **THEN** 下拉菜单出现，包含修改标题或删除 session 的选项

#### Scenario: Session 标题区域不为隐藏菜单按钮永久让位

- **WHEN** session 条目未处于 hover、focus 或菜单打开状态
- **THEN** 标题区域不为隐藏的三点菜单按钮保留固定右侧 padding
- **AND** 标题仍以单行省略号截断
- **AND** chat sidebar 宽度不改变

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

系统 SHALL 在真实 session 创建时，从草稿态首条 prompt 的 `parts` 中选取**第一条 `type === "text"` 且不是 system-reminder 包裹**的 text part，作为本地兜底标题的原文；其中 system-reminder 包裹定义为：经 `String#trim` 后以 `<system-reminder>` 开头并以 `</system-reminder>` 结尾的 text part（与 `src/renderer/src/utils/system-reminder.ts` 的 `isSystemReminderPart` 判定一致）。系统 SHALL 在该原文上保留既有截断与抽取策略——优先匹配 `^\*\*标题\*\*:\s*(.+)$` 行作为标题来源；否则去首尾空白并将连续空白压缩为单个空格——再取前 30 个字符。当 `parts` 中不存在任何符合上述条件的 text part，或抽取后字符串为空时，系统 SHALL 使用 `DEFAULT_SESSION_TITLE`（`"New Session"`）作为兜底标题。

当 ACP agent 在对话过程中推送 `session_info_update` 事件且包含 `title` 字段时，系统 SHALL 用该值覆盖当前标题并持久化到磁盘。

#### Scenario: 新 session 使用首条非 system-reminder 文本兜底标题

- **WHEN** 用户在草稿态发送第一条消息并创建 session，且 `parts` 全部为非 system-reminder 的 text part
- **THEN** session 标题初始显示为对首条 text part 内容执行去首尾空白、压缩连续空白后的前 30 个字符

#### Scenario: 草稿态首条 prompt 含 system-reminder 时跳过 reminder 取后续文本

- **WHEN** 用户在草稿态发送第一条消息，且 `parts[0]` 是 system-reminder 包裹的 text part，`parts[1]` 是普通 text part
- **THEN** session 兜底标题基于 `parts[1]` 文本生成，不包含 `parts[0]` 的任何字符
- **AND** 截断策略与现有一致（`**标题**:` 抽取优先，否则空白归一后取前 30 个字符）

#### Scenario: 草稿态首条 prompt 仅含 system-reminder 时回退默认标题

- **WHEN** 用户在草稿态发送第一条消息，且 `parts` 中所有 text part 都是 system-reminder 包裹
- **THEN** session 标题为 `DEFAULT_SESSION_TITLE`（`"New Session"`）
- **AND** 不抛错，不影响后续 `streamMessage` 调用

#### Scenario: Agent 未推送标题时保留兜底标题

- **WHEN** 新 session 创建后，ACP agent 未推送任何 `session_info_update`
- **THEN** session 标题保持为首条非 system-reminder 文本生成的兜底标题

#### Scenario: Agent 推送标题后更新

- **WHEN** ACP agent 推送 `session_info_update` 事件且 `title` 字段非空
- **THEN** session 标题更新为 agent 推送的值，并持久化到磁盘元数据文件

### Requirement: Session 重命名和删除同步到磁盘

系统 SHALL 在用户修改 session 标题或删除 session 时，将变更同步持久化到磁盘。Session 标题修改 SHALL 使用应用内交互完成，不得调用浏览器原生 `window.prompt`。删除 session SHALL 使用全局确认弹窗 `useConfirmDialog()` 完成确认，不得调用浏览器原生 `window.confirm`。

修改标题入口的用户可见文案 SHALL 为“修改标题”。用户提交标题时，系统 SHALL 对输入执行首尾空白裁剪；裁剪后为空或与当前标题相同的输入 SHALL NOT 调用持久化更新。裁剪后非空且不同于当前标题的输入 SHALL 调用现有 session 更新链路写入磁盘 session 元数据文件。

删除确认弹窗 SHALL 使用危险操作语义，确认按钮文案 SHALL 为“删除会话”。用户取消确认时 SHALL NOT 删除 session；用户确认后 SHALL 调用现有删除链路删除磁盘上的元数据文件和消息文件。

#### Scenario: 修改 session 标题

- **WHEN** 用户通过菜单选择“修改标题”
- **AND** 输入不同于当前标题的非空标题并提交
- **THEN** 新标题写入磁盘 session 元数据文件

#### Scenario: 空标题不提交

- **WHEN** 用户通过菜单选择“修改标题”
- **AND** 提交的标题经首尾空白裁剪后为空
- **THEN** 系统不调用 session 标题持久化更新

#### Scenario: 未变化标题不提交

- **WHEN** 用户通过菜单选择“修改标题”
- **AND** 提交的标题经首尾空白裁剪后与当前标题相同
- **THEN** 系统不调用 session 标题持久化更新

#### Scenario: 删除 session

- **WHEN** 用户通过菜单删除 session
- **AND** 用户在确认弹窗中确认删除
- **THEN** 磁盘上对应的元数据文件和消息文件均被删除

#### Scenario: 取消删除 session

- **WHEN** 用户通过菜单删除 session
- **AND** 用户在确认弹窗中取消删除
- **THEN** 系统不调用 session 删除持久化操作

### Requirement: Session 加载恢复可用命令

系统 SHALL 在从磁盘 session meta 加载 session 列表或 session 信息时，恢复持久化的 agent 可用命令列表与 ACP session 级 `configOptions`。主进程读取 session meta 的 `available_commands` 与 `config_options` 字段后 SHALL 通过 IPC 返回为 `Session.availableCommands` 与 `Session.configOptions`，renderer SHALL 在 `normalizeSession` 后保留这两个字段；缺失字段时返回 `undefined`，renderer 不抛错。

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

#### Scenario: Session 列表加载时恢复 configOptions

- **WHEN** 项目内某 session meta 包含 `config_options: [{ id: "model", type: "select", currentValue: "sonnet", ... }]`
- **THEN** `chat:listSessions` 返回的对应 `Session.configOptions` 为同一 schema 数组
- **AND** `useSessionStore.loadSessions` 后该 session 对象保留 `configOptions`
- **AND** 用户选择该 session 时 `ConfigOptionsBar` 立即按 `activeSession.configOptions` 渲染，不需要等任何 stream chunk

#### Scenario: 缺失 config_options 字段保持兼容

- **WHEN** 历史 session meta 不包含 `config_options`
- **THEN** `chat:listSessions` 返回的对应 `Session.configOptions` 为 `undefined`
- **AND** `ConfigOptionsBar.sourceOptions` 通过 `?? []` 回落为空数组，组件因 `hasConfigOptions === false` 不渲染条目，不抛错

### Requirement: 草稿态首条消息懒创建时携带 probe configOptions 与 acpSessionId

系统 SHALL 在用户从草稿态发送第一条消息触发 `createSession` 时，把发送瞬间已 `ready` 的 draft probe 的 `configOptions` 与 `acpSessionId` 一并写入新建的 `SessionMeta`，并通过 `chat:createSession` 的返回值带回 renderer，使新 `Session.configOptions` 在被加入 `useSessionStore.sessions` 时已具备完整内存态。

具体行为：

- 渲染端 `useChatStore.streamMessage` 在调用 `useSessionStore.createSession` 时 SHALL 透传 `configOptions: probeBeforeCreate.configOptions` 与 `acpSessionId: probeBeforeCreate.acpSessionId`，仅当 `probeBeforeCreate?.status === "ready"` 且 `acpSessionId` 非空时透传；否则不传，行为退化到不带这两个字段的老路径。
- `useSessionStore.createSession` SHALL 在 action 入参中扩展可选字段 `configOptions?: AcpSessionConfigOption[]` 与 `acpSessionId?: string`，并透传给 `chatApi.createSession`。
- 主进程 `chat-service.createSession` SHALL 在构造 `SessionMeta` 时把入参 `configOptions` 写入 `meta.config_options`、把 `acpSessionId` 写入 `meta.acpSessionId`；缺省时这两个字段在 `meta.json` 中保持 `undefined`，不出现在文件中。
- 主进程 `chat:createSession` IPC handler SHALL 通过 `toSession(meta, projectId)` 返回包含 `configOptions` 与 `acpSessionId` 的 `Session` 对象。
- 渲染端 `applyProbeUpdate(draftAgentIdSnapshot, null)` SHALL 在 `useSessionStore.createSession` 的 Promise resolve 后、`activeSession` 已切到新 session 时再调用；SHALL NOT 在 `createSession` 之前或与之并行执行，以避免出现 `activeSession.configOptions === undefined` 与 `activeDraftProbe === null` 同时成立的中间帧。

#### Scenario: 草稿态首条消息后 ConfigOptionsBar 不出现空帧

- **WHEN** 用户在草稿态选定 agent，draft probe 状态为 `ready` 且 `configOptions` 非空
- **AND** 用户发送第一条消息触发 `createSession`
- **THEN** `useSessionStore.createSession` 返回的 `Session.configOptions` 与 draft probe 的 `configOptions` 等值
- **AND** `useSessionStore.sessions` 中新条目就位的同一帧，`activeSession.configOptions` 已为该值
- **AND** `applyProbeUpdate(draftAgentIdSnapshot, null)` 在该帧之后调用
- **AND** `ConfigOptionsBar.sourceOptions` 在整个过渡过程中始终非空数组

#### Scenario: 透传字段写入新建 SessionMeta

- **WHEN** `chat:createSession` IPC 入参包含 `configOptions: [...]` 与 `acpSessionId: "sess-A"`
- **THEN** 新建的 session meta JSON 文件包含字段 `config_options: [...]` 与 `acpSessionId: "sess-A"`
- **AND** 已有的 `tokenUsage` 初始化为 `{ used: 0, size: 0 }`，`turnCount` 为 `0`，`title` 为入参 `title`
- **AND** IPC 返回的 `Session` 对象 `configOptions` 与入参一致

#### Scenario: 不携带 probe 字段时退化到老路径

- **WHEN** `chat:createSession` IPC 入参不含 `configOptions` 与 `acpSessionId`（恢复型创建、测试或 probe 未就绪）
- **THEN** 新建的 session meta 文件不包含 `config_options` / `acpSessionId` 字段
- **AND** IPC 返回的 `Session.configOptions` 为 `undefined`
- **AND** 后续 stream `chat:stream:message` 的 `takeFor` 兜底路径行为不变

#### Scenario: createSession 失败不丢 draft probe

- **WHEN** 用户从草稿态发送第一条消息，但 `useSessionStore.createSession` 抛错
- **THEN** `useChatStore.streamMessage` SHALL NOT 调用 `applyProbeUpdate(draftAgentIdSnapshot, null)`
- **AND** `draftProbeByAgent` 中 `draftAgentIdSnapshot` 对应 entry 保持 `ready` 与原 `configOptions`
- **AND** 用户再次发送时复用同一 draft probe

### Requirement: Chat 左侧 Session Sidebar 支持折叠

系统 SHALL 在 Chat 主区域顶部提供一个侧栏切换按钮，用于折叠或展开左侧 session sidebar。该按钮由 `ChatContainer` 顶部现有 `panel-left` 图标按钮承载。

系统 SHALL 将左侧 session sidebar 的折叠状态作为 `/chat` 页面内存态管理。折叠状态 SHALL NOT 持久化到磁盘、全局偏好、session 元数据或 Pinia 全局 store。

当左侧 session sidebar 展开时，系统 SHALL 显示现有 `ChatSidebar` 内容，并保持 session 列表、新建 session、session 选择、高亮、更多菜单和后台 stream 行为不变。

当左侧 session sidebar 折叠时，系统 SHALL 隐藏左侧 session sidebar，并释放其横向宽度，使 Chat conversation 区域使用释放后的空间。折叠 SHALL NOT 卸载当前 active session、停止后台 stream、清空聊天输入、清空消息列表或改变右侧事件栏语义。

侧栏切换按钮 SHALL 根据当前折叠状态提供明确的可访问性语义：

- sidebar 展开时，按钮动作文案 SHALL 表示“折叠聊天列表”。
- sidebar 折叠时，按钮动作文案 SHALL 表示“展开聊天列表”。
- 按钮 SHALL 设置 `aria-label` 或等价可访问名称。
- 按钮 SHALL 设置 `aria-expanded` 表示左侧 session sidebar 当前是否展开。
- 按钮图标 SHALL 随当前状态切换，展开态显示收起/关闭侧栏语义，折叠态显示打开侧栏语义。

#### Scenario: 点击按钮折叠左侧 session sidebar

- **GIVEN** 用户位于 Chat 页面
- **AND** 左侧 session sidebar 当前处于展开状态
- **WHEN** 用户点击 Chat 顶部的 `panel-left` 侧栏切换按钮
- **THEN** 左侧 session sidebar 被折叠并不再占用原有 `w-65` 横向宽度
- **AND** Chat conversation 区域自然扩展到释放后的空间
- **AND** 当前 active session、消息列表、输入区和后台 stream 状态保持不变

#### Scenario: 再次点击按钮展开左侧 session sidebar

- **GIVEN** 用户位于 Chat 页面
- **AND** 左侧 session sidebar 当前处于折叠状态
- **WHEN** 用户再次点击 Chat 顶部的 `panel-left` 侧栏切换按钮
- **THEN** 左侧 session sidebar 恢复展开
- **AND** `ChatSidebar` 显示现有 session 列表
- **AND** session 列表的排序、选中状态、更多菜单和新建 session 行为保持不变

#### Scenario: 侧栏切换按钮语义跟随状态

- **GIVEN** 用户位于 Chat 页面
- **WHEN** 左侧 session sidebar 处于展开状态
- **THEN** 侧栏切换按钮的可访问名称和 `title` 表示“折叠聊天列表”
- **AND** 按钮 `aria-expanded` 表示 sidebar 当前已展开
- **WHEN** 左侧 session sidebar 处于折叠状态
- **THEN** 侧栏切换按钮的可访问名称和 `title` 表示“展开聊天列表”
- **AND** 按钮 `aria-expanded` 表示 sidebar 当前未展开

#### Scenario: 折叠状态不持久化

- **GIVEN** 用户位于 Chat 页面
- **AND** 用户已将左侧 session sidebar 折叠
- **WHEN** Chat 页面重新创建
- **THEN** 左侧 session sidebar 回到默认展开状态
- **AND** 系统不从磁盘、全局偏好、session 元数据或 Pinia 全局 store 读取 sidebar 折叠状态

# chat-agent-selection 规范

## Purpose

定义 Chat 界面中 agent 选择的数据模型与状态管理规范，将 chat 层的 agent 表示（ChatAgent）与 ACP 层的 agent 注册表（AcpAgentEntry）解耦。

## Requirements

### Requirement: ChatAgent 数据模型

系统 SHALL 定义 `ChatAgent` 类型，表示用户在 chat 界面选择的 agent 实例。`ChatAgent` SHALL 包含：`id`（自身唯一标识）、`name`（显示名称）、`acpAgentId`（关联的 ACP agent id，引用 `AcpAgentEntry.id` 或 Custom Agent id）。

`ChatAgent` 与 `AcpAgentEntry` 的关系 SHALL 为引用关系（通过 `acpAgentId`），而非嵌套或继承，两者生命周期独立。**当 `acpAgentId` 以 `custom-` 开头时，该 Agent 为自定义 Agent，不依赖 ACP Registry。**

#### Scenario: ChatAgent 引用已安装的 ACP agent

- **WHEN** 系统中存在一个 `acpAgentId` 为 `"claude-code"` 的 `ChatAgent`
- **THEN** 可通过 `acpAgentId` 在 `AcpAgentEntry[]` 中查找到对应的 ACP agent 信息

#### Scenario: ChatAgent 引用自定义 Agent

- **WHEN** 系统中存在一个 `acpAgentId` 为 `"custom-kimi-acp-7f3a9e2d"` 的 `ChatAgent`
- **THEN** 系统 SHALL 从 `custom-agents.json` 中查找到对应的配置与显示名

#### Scenario: ChatAgent 与 AcpAgent 解耦

- **WHEN** ACP agent 的安装状态发生变化（安装/卸载/更新）
- **THEN** `ChatAgent` 的数据结构本身不受影响，仅通过 `acpAgentId` 的查找结果反映状态变化

### Requirement: chat store 使用 ChatAgent 类型

`chat` store 中的当前 agent 状态 SHALL 使用 `ChatAgent` 类型。

#### Scenario: chat store 初始化

- **WHEN** chat store 初始化
- **THEN** `currentAgent` 为 `ChatAgent` 类型，包含 `id`、`name`、`acpAgentId` 字段

### Requirement: Agent 切换在非流式状态下生效

系统 SHALL 在当前 session 的 `messages.length === 0` 时允许切换 agent。选择器的数据来源为已安装 **Catalog Agent** 列表，绑定目标取决于当前是否存在 active session。

agent 选择入口 SHALL 为 `ChatEmptyAgentPicker` 中的 `InstalledAgentTile`（即点即生效）和 `AgentPickerModal`（两步确认）。`ChatAgentSelect` 下拉选择器不再作为 agent 切换入口。

#### Scenario: 草稿态下点击 InstalledAgentTile 绑定 draft agent

- **WHEN** 用户点击"新建 Session"进入草稿态，且当前没有任何 active session
- **THEN** `ChatEmptyAgentPicker` 中的 `InstalledAgentTile` 处于可交互状态
- **AND** 点击后调用 `sessionStore.setDraftAgent(agentId)`，`draftAgentId` 立即更新

#### Scenario: 草稿态首条消息继承当前所选 agent

- **WHEN** 用户在草稿态发送第一条消息
- **THEN** 新创建的 session 的 `agentId` 等于当时的 `draftAgentId`

#### Scenario: 切换到已有 session 时选中态跟随 session

- **WHEN** 用户切换到某个已有 session（`messages.length === 0`）
- **THEN** `ChatEmptyAgentPicker` 中对应 agent 的 `InstalledAgentTile` 显示选中态

#### Scenario: 会话开始后不再显示空态 picker

- **WHEN** 当前 active session 的 `messages.length > 0`
- **THEN** `ChatEmptyAgentPicker` 不渲染，`ChatMessageList` 渲染

### Requirement: 草稿态默认 agent 不得硬编码

系统 SHALL 从已安装 **Catalog Agent** 集合中解析草稿态默认 agent，不得在 session store 或组件中硬编码固定 `agentId`。

#### Scenario: 已安装 agent 可用时解析默认 draft agent

- **WHEN** 用户进入草稿态，且系统中至少有一个已安装 Catalog Agent
- **THEN** 系统为 `draftAgentId` 选择一个来自已安装 Catalog Agent 集合的值

#### Scenario: draft agent 不回退到硬编码值

- **WHEN** 当前已安装 Catalog Agent 集合发生变化，或原先的 `draftAgentId` 已不再可用
- **THEN** 系统只允许从新的已安装 Catalog Agent 集合中重新解析 `draftAgentId`
- **AND** 不得回退到任何硬编码固定 `agentId`

#### Scenario: 无已安装 agent 时不创建 session

- **WHEN** 用户处于草稿态，且系统中没有任何已安装 Catalog Agent
- **THEN** `draftAgentId` 保持为空
- **AND** 用户发送首条消息时，系统不得创建 session，并应提示用户先安装或配置 agent

### Requirement: Chat 空态 AgentPickerModal 卡片表达分类差异

Chat 空态弹窗 `AgentPickerModal` 中的 `AgentPickerCard` SHALL 根据 `agent.__fyllo.kind` 渲染分类标识，与设置页 `AgentCard` 共用同一个徽章组件（如 `AgentKindBadge.vue`），以保证图标与文案一致。

渲染规则：

- `native` 或缺失 `__fyllo`：不渲染分类图标
- `adapter`：渲染 `i-lucide-layers` 图标，hover 显示「适配器 · 自带完整实现，可与已安装的对应 Agent 共享配置」
- `bridge`：渲染 `i-lucide-cable` 图标，hover 显示「桥接器 · 与 Agent 桥接打通，需要先安装对应的 Agent」

**Custom Agent 卡片不渲染 `__fyllo.kind` 分类图标，因为它无 Registry 元数据。**

#### Scenario: AgentPickerModal 卡片显示分类图标

- **WHEN** `AgentPickerModal` 中渲染的 `AgentPickerCard` 对应 agent `__fyllo.kind` 为 `"adapter"` 或 `"bridge"`
- **THEN** 卡片名称行 SHALL 显示对应的分类图标
- **AND** hover 时 SHALL 显示对应文案

#### Scenario: AgentPickerModal native 卡片保持简洁

- **WHEN** `AgentPickerModal` 中渲染的 `AgentPickerCard` 对应 agent `__fyllo.kind` 为 `"native"` 或 `__fyllo` 缺失
- **THEN** 卡片 SHALL 不显示任何分类图标

#### Scenario: Custom Agent 卡片不显示分类图标

- **WHEN** `AgentPickerModal` 的 Custom tab 中渲染自定义 Agent 卡片
- **THEN** 卡片 SHALL 不显示 `__fyllo.kind` 分类图标

### Requirement: AgentPickerModal 支持 Registry/Custom tab

`AgentPickerModal` SHALL 在顶部提供 "Registry" 与 "Custom" 两个 tab。Registry tab SHALL 展示 Registry Agent，并保留搜索框与"已安装 / 未安装"分组；Custom tab SHALL 展示已配置的 Custom Agent，以卡片网格形式呈现，不提供搜索框。

#### Scenario: Registry tab 保持原有行为

- **WHEN** 用户处于 Registry tab
- **THEN** 弹窗 SHALL 按现有规则展示 Registry Agent，搜索框可用，分组为"已安装"与"未安装"

#### Scenario: Custom tab 展示自定义 Agent

- **WHEN** 用户切换到 Custom tab
- **THEN** 弹窗 SHALL 以卡片网格展示所有自定义 Agent
- **AND** 不提供搜索框

#### Scenario: Custom tab 为空

- **WHEN** Custom tab 中没有任何自定义 Agent
- **THEN** SHALL 展示空状态提示，并提供"去设置页添加"入口

### Requirement: Chat 空态 InstalledAgentTile 不展示分类

Chat 空态首屏的 `InstalledAgentTile` SHALL **不**接受、传递或渲染 `__fyllo.kind` 相关的视觉标识。该 tile 仅承担 agent 切换入口职责，引导/教育由 `AgentPickerModal` 中的 `AgentPickerCard` 承担。

#### Scenario: InstalledAgentTile 不渲染分类徽章

- **WHEN** Chat 空态渲染任意 `InstalledAgentTile`（无论对应 agent `__fyllo.kind` 为何值）
- **THEN** tile 内 SHALL **不**显示任何分类图标或徽章

#### Scenario: InstalledAgentTile 不接受 kind prop

- **WHEN** 检视 `InstalledAgentTile.vue` 的 `defineProps`
- **THEN** SHALL **不**包含 `kind` 字段
- **AND** 父组件 `ChatEmptyAgentPicker` 在传值时 SHALL **不**传 `kind`

#### Scenario: 切换/选中行为不受分类影响

- **WHEN** 用户在 Chat 空态点击 adapter 或 bridge 类的 `InstalledAgentTile`
- **THEN** `sessionStore.setDraftAgent(agentId)` 的调用与 native 类完全一致
- **AND** 分类元数据 SHALL 不影响选中、确认、流式等交互逻辑

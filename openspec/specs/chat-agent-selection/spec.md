# chat-agent-selection Specification

## Purpose

定义 Chat 界面中 agent 选择的数据模型与状态管理规范，将 chat 层的 agent 表示（ChatAgent）与 ACP 层的 agent 注册表（AcpAgentEntry）解耦。

## Requirements

### Requirement: ChatAgent 数据模型

系统 SHALL 定义 `ChatAgent` 类型，表示用户在 chat 界面选择的 agent 实例。`ChatAgent` SHALL 包含：`id`（自身唯一标识）、`name`（显示名称）、`acpAgentId`（关联的 ACP agent id，引用 `AcpAgentEntry.id`）。

`ChatAgent` 与 `AcpAgentEntry` 的关系 SHALL 为引用关系（通过 `acpAgentId`），而非嵌套或继承，两者生命周期独立。

#### Scenario: ChatAgent 引用已安装的 ACP agent

- **WHEN** 系统中存在一个 `acpAgentId` 为 `"claude-code"` 的 `ChatAgent`
- **THEN** 可通过 `acpAgentId` 在 `AcpAgentEntry[]` 中查找到对应的 ACP agent 信息

#### Scenario: ChatAgent 与 AcpAgent 解耦

- **WHEN** ACP agent 的安装状态发生变化（安装/卸载/更新）
- **THEN** `ChatAgent` 的数据结构本身不受影响，仅通过 `acpAgentId` 的查找结果反映状态变化

### Requirement: chat store 使用 ChatAgent 类型

`chat` store 中的当前 agent 状态 SHALL 使用 `ChatAgent` 类型。

#### Scenario: chat store 初始化

- **WHEN** chat store 初始化
- **THEN** `currentAgent` 为 `ChatAgent` 类型，包含 `id`、`name`、`acpAgentId` 字段

### Requirement: ChatAgentSelect 展示已安装 ACP agent 列表

系统 SHALL 将 `AgentSelect` 组件重命名为 `ChatAgentSelect`，数据源改为 `useAcpAgentsStore` 中 `statuses[id].installed === true` 的 agent 列表，不再使用硬编码列表。ACP agent 数据 SHALL 在 app 启动后的 bootstrap 阶段预热，而不是依赖 settings 页面触发首次加载。

#### Scenario: 展示已安装 agent

- **WHEN** 用户打开 ChatAgentSelect 下拉菜单
- **THEN** 列表只显示 `statuses[id].installed === true` 的 ACP agent
- **AND** 每个选项显示 agent 名称和图标（来自 `icons[id]`，无图标时显示默认图标）

#### Scenario: 无已安装 agent 时的空状态

- **WHEN** 没有任何 ACP agent 处于已安装状态
- **THEN** 下拉菜单显示空状态提示，引导用户前往设置安装 agent

#### Scenario: 进入项目后直接看到已安装 agent

- **WHEN** 用户启动应用并进入某个 project，且 ACP agent bootstrap 已完成
- **THEN** ChatAgentSelect 直接显示已安装 ACP agent 列表
- **AND** 不要求用户先访问 settings 页面

#### Scenario: bootstrap 未完成时短暂空态

- **WHEN** ChatAgentSelect 首次渲染时 ACP agent bootstrap 尚未完成
- **THEN** 组件允许短暂显示空态
- **AND** bootstrap 完成后自动更新为已安装 agent 列表

### Requirement: Agent 切换在非流式状态下生效

系统 SHALL 在当前 session 的 `messages.length === 0` 时允许切换 agent。选择器的数据来源仍为已安装 ACP agent 列表，但其绑定目标取决于当前是否存在 active session。

#### Scenario: 草稿态下选择器绑定 draft agent

- **WHEN** 用户点击"新建 Session"进入草稿态，且当前没有任何 active session
- **THEN** `ChatAgentSelect` 仍处于可交互状态
- **AND** 其值绑定到响应式的 `draftAgentId`，而不是 `activeSession.agentId`

#### Scenario: 草稿态首条消息继承当前所选 agent

- **WHEN** 用户在草稿态发送第一条消息
- **THEN** 新创建的 session 的 `agentId` 等于当时选择器中的 `draftAgentId`

#### Scenario: 切换到已有 session 时选择器跟随 session

- **WHEN** 用户切换到某个已有 session
- **THEN** `ChatAgentSelect` 显示该 session 持久化的 `agentId`

#### Scenario: 会话开始后禁止切换 agent

- **WHEN** 当前 active session 的 `messages.length > 0`
- **THEN** `ChatAgentSelect` 处于禁用状态，不可切换

#### Scenario: 流式进行中保持禁用

- **WHEN** 当前 session 正在流式输出（`chatStatus === "streaming"`）
- **THEN** `ChatAgentSelect` 处于禁用状态（与"会话开始后禁止切换"一致）

### Requirement: 草稿态默认 agent 不得硬编码

系统 SHALL 从已安装 ACP agent 集合中解析草稿态默认 agent，不得在 session store 或组件中硬编码固定 `agentId`。

#### Scenario: 已安装 agent 可用时解析默认 draft agent

- **WHEN** 用户进入草稿态，且系统中至少有一个已安装 ACP agent
- **THEN** 系统为 `draftAgentId` 选择一个来自已安装 agent 集合的值

#### Scenario: draft agent 不回退到硬编码值

- **WHEN** 当前已安装 agent 集合发生变化，或原先的 `draftAgentId` 已不再可用
- **THEN** 系统只允许从新的已安装 agent 集合中重新解析 `draftAgentId`
- **AND** 不得回退到任何硬编码固定 `agentId`

#### Scenario: 无已安装 agent 时不创建 session

- **WHEN** 用户处于草稿态，且系统中没有任何已安装 ACP agent
- **THEN** `draftAgentId` 保持为空
- **AND** 用户发送首条消息时，系统不得创建 session，并应提示用户先安装 agent

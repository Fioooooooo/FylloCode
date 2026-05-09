## MODIFIED Requirements

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

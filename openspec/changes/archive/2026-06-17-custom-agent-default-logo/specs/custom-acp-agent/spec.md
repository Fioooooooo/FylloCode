## MODIFIED Requirements

### Requirement: 默认图标

自定义 Agent 无图标时，系统 SHALL 使用 FylloCode Logo（通过 `CustomAgentIcon.vue` 组件渲染）作为默认图标。

#### Scenario: SessionItem 显示默认图标

- **WHEN** 渲染一个自定义 Agent 的 session 历史项，且该 Agent 无图标
- **THEN** `SessionItem` SHALL 展示 FylloCode Logo（`color="neutral"`）

#### Scenario: AgentPickerCard 显示默认图标

- **WHEN** 在 Agent 选择器中展示一个自定义 Agent，且该 Agent 无图标
- **THEN** `AgentPickerCard` SHALL 展示 FylloCode Logo（`color="neutral"`）

#### Scenario: ChatEmptyAgentPicker 显示默认图标

- **WHEN** 在 Chat 空态展示已安装的自定义 Agent，且该 Agent 无图标
- **THEN** `ChatEmptyAgentPicker` SHALL 展示 FylloCode Logo（`color="neutral"`）

#### Scenario: AgentPickerModal 空态显示默认图标

- **WHEN** `AgentPickerModal` 切换到 Custom tab 且没有任何自定义 Agent
- **THEN** `AgentPickerModal` SHALL 展示 FylloCode Logo（`color="neutral"`）作为空态图标

## MODIFIED Requirements

### Requirement: Chat EventRail 内 Panel Header 视觉统一

`ChatAgentAgendaPanel` 与 `ChatProposalPanel` 的 Section Header SHALL 使用一致的视觉与交互结构。

#### Scenario: 用户同时看到行动清单与会话提案

- **GIVEN** 当前 session 同时存在 agent agenda entries 与 proposals
- **WHEN** `ChatSessionEventRail` 渲染
- **THEN** 两个 Panel 的 Header SHALL 均为可折叠按钮
- **AND** Header 左侧 SHALL 显示图标与中文标题
- **AND** Header 右侧 SHALL 显示计数与折叠 chevron
- **AND** 标题字号、字重、颜色、字间距 SHALL 一致

### Requirement: Chat EventRail Panel 标题使用中文

`ChatAgentAgendaPanel` 与 `ChatProposalPanel` 的标题 SHALL 使用简体中文，去除英文文案。

#### Scenario: 用户查看右侧事件栏

- **GIVEN** `ChatSessionEventRail` 渲染
- **WHEN** 用户查看 Panel 标题
- **THEN** `ChatAgentAgendaPanel` 标题 SHALL 为“行动清单”
- **AND** `ChatProposalPanel` 标题 SHALL 为“会话提案”

### Requirement: Chat EventRail 内多个 Panel 间距统一

当 `ChatSessionEventRail` 内同时渲染多个 Panel 时，Panel 之间的垂直间距 SHALL 一致。

#### Scenario: 同时存在行动清单与会话提案

- **GIVEN** `ChatAgentAgendaPanel` 与 `ChatProposalPanel` 同时渲染
- **WHEN** 用户查看 Rail 内容区
- **THEN** 两个 Panel 之间的外间距 SHALL 与 Rail 内容区 `space-y-*` 一致
- **AND** Panel 内部 Header 与内容区间的内间距 SHALL 一致

### Requirement: Panel 内容形态保持不变

统一 Header 后，`ChatAgentAgendaPanel` 与 `ChatProposalPanel` 的内容展示形态 SHALL 维持原有设计。

#### Scenario: 用户查看行动清单内容

- **GIVEN** `ChatAgentAgendaPanel` 展开
- **WHEN** 用户查看行动清单条目
- **THEN** 条目 SHALL 继续以无背景列表形式展示

#### Scenario: 用户查看会话提案内容

- **GIVEN** `ChatProposalPanel` 展开
- **WHEN** 用户查看 proposal item
- **THEN** item SHALL 继续以 `rounded-lg border border-default bg-default p-3` 卡片形式展示

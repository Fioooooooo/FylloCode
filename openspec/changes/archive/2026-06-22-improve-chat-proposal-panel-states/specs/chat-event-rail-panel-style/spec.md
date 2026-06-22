## MODIFIED Requirements

### Requirement: creating 状态不显示查看详情按钮

`ChatProposalPanel` 中处于 `creating` 状态的 proposal SHALL 不展示任何操作按钮。除 `creating` 外，
每个 proposal 卡片 SHALL 展示“查看详情”按钮或等价的显式详情入口，使用户无需离开 Chat 再到概览页查找 proposal。

#### Scenario: 用户查看 creating 状态的 proposal

- **GIVEN** 一个 `creating` 状态的 proposal
- **WHEN** `ChatProposalPanel` 渲染该 proposal 卡片
- **THEN** 该卡片 SHALL 不显示“查看详情”按钮
- **AND** 该卡片 SHALL 不显示“开始实现”或“归档”按钮

#### Scenario: 用户查看 draft 状态的 proposal

- **GIVEN** 一个 `draft` 状态的 proposal
- **WHEN** `ChatProposalPanel` 渲染该 proposal 卡片
- **THEN** 该卡片 SHALL 显示“开始实现”按钮
- **AND** 该卡片 SHALL 显示“查看详情”按钮

#### Scenario: 用户查看 applying 状态的 proposal

- **GIVEN** 一个 `applying` 状态的 proposal
- **WHEN** `ChatProposalPanel` 渲染该 proposal 卡片
- **THEN** 该卡片 SHALL 显示“查看详情”按钮

#### Scenario: 用户查看可归档状态的 proposal

- **GIVEN** 一个 `applying` 状态的 proposal
- **AND** `proposalRunStore.runMeta?.changeId === proposal.id`
- **AND** `proposalRunStore.runMeta?.status === "done"`
- **WHEN** `ChatProposalPanel` 渲染该 proposal 卡片
- **THEN** 该卡片 SHALL 显示“归档”按钮
- **AND** 该卡片 SHALL 显示“查看详情”按钮

#### Scenario: 用户查看 archived 状态的 proposal

- **GIVEN** 一个 `archived` 状态的 proposal
- **WHEN** `ChatProposalPanel` 渲染该 proposal 卡片
- **THEN** 该卡片 SHALL 显示“查看详情”按钮
- **AND** 该卡片 SHALL 不显示“开始实现”或“归档”按钮

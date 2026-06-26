## MODIFIED Requirements

### Requirement: 不展示执行日志

`ChatSessionEventRail` 和 `ChatProposalPanel` SHALL 不渲染 apply/archive 的流式消息、阶段详情或工具调用日志。

#### Scenario: apply 运行中

- **GIVEN** 一个 `applying` 状态的 proposal
- **WHEN** apply 正在流式执行
- **THEN** `ChatProposalPanel` SHALL 仅展示“实施中”状态 badge，不展示任何 chunk 消息或阶段进度条

#### Scenario: 用户需要查看详细日志

- **GIVEN** 一个 `applying` 状态的 proposal
- **WHEN** 用户点击 proposal 条目或“查看详情”入口
- **THEN** 应用 SHALL 打开 proposal 详情 Slideover
- **AND** 详情 Slideover 的 `ProposalApplySidePanel` SHALL 展示完整日志
- **AND** 应用 SHALL NOT 导航到 `/proposal/<changeId>`

## ADDED Requirements

### Requirement: ChatProposalPanel 通过 Slideover 打开详情

除 `creating` 状态外，`ChatProposalPanel` 中每个 proposal 卡片 SHALL 展示“查看详情”按钮或等价的显式详情入口。该入口 SHALL 调用 programmatic proposal 详情 Slideover 打开函数并传入 proposal id；不得调用 `router.push('/proposal/<id>')`。

#### Scenario: draft proposal 打开详情

- **GIVEN** `ChatProposalPanel` 渲染一个 `draft` proposal
- **WHEN** 用户点击“查看详情”
- **THEN** 应用打开 proposal 详情 Slideover
- **AND** 当前 Chat route 与 active session 保持不变

#### Scenario: archived proposal 打开详情

- **GIVEN** `ChatProposalPanel` 渲染一个 `archived` proposal
- **WHEN** 用户点击“查看详情”
- **THEN** 应用打开 proposal 详情 Slideover，并传入 archived proposal id
- **AND** 当前 Chat route 与 active session 保持不变

#### Scenario: creating proposal 不显示详情入口

- **GIVEN** `ChatProposalPanel` 渲染一个 `creating` proposal
- **WHEN** 用户查看 proposal 卡片操作区
- **THEN** 该卡片不显示“查看详情”按钮
- **AND** 该卡片不打开详情 Slideover

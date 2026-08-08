## ADDED Requirements

### Requirement: Proposal 详情不直接提供生命周期操作入口

系统 SHALL 让 Proposal 详情 Slideover 保持只读浏览与现有运行状态展示，不得在详情头部提供 workflow Apply、Archive 或查看运行历史的操作按钮。系统 SHALL 保留现有 Proposal 状态 badge、进行中状态条和运行 side panel 行为，不得因移除头部入口而删除底层 Apply/Archive 或运行历史能力。

#### Scenario: 用户打开 draft Proposal 详情

- **WHEN** 用户打开状态为 `draft` 的 Proposal 详情 Slideover
- **THEN** 详情头部 SHALL NOT 展示“开始实现”按钮或 workflow dropdown
- **AND** 详情内容、owner、状态和任务信息 SHALL 继续展示

#### Scenario: 用户打开 applying 或 archived Proposal 详情

- **WHEN** 用户打开状态为 `applying` 或 `archived` 的 Proposal 详情 Slideover
- **THEN** 详情头部 SHALL NOT 展示“归档”或“查看运行历史”按钮
- **AND** 已有运行状态条和运行 side panel SHALL 继续按现有 run state 展示

### Requirement: Event Rail 通过 Chat 用户消息发起 Proposal Apply

Chat Event Rail SHALL 为状态为 `draft` 的 Proposal 卡片展示直接“开始实现”按钮，不得展示 workflow dropdown。用户点击该按钮时，renderer SHALL 调用现有 `chatStore.sendMessage` 并发送单个 text part，文本 SHALL 为 `Start applying proposal: <changeId> (folderId: <folderId>)`，其中两个占位符来自卡片的完整 `ProposalRef`。该消息 SHALL 通过现有 Chat 流水线作为 `role=user` 消息进入当前会话，组件 SHALL NOT 直接调用 Proposal run store 启动 Apply。

#### Scenario: 用户从 Event Rail 发起 draft Proposal Apply

- **WHEN** 用户点击 draft Proposal 卡片的“开始实现”按钮
- **THEN** 系统 SHALL 调用 `chatStore.sendMessage` 并传入一个 text part
- **AND** text SHALL 同时包含该 Proposal 的 `changeId` 与 owner `folderId`
- **AND** 系统 SHALL NOT 要求用户选择 workflow
- **AND** 组件 SHALL NOT 直接调用 `proposalRunStore.startRun`

#### Scenario: Event Rail 保持其他 Proposal 操作

- **WHEN** Proposal 卡片可查看详情或达到 archive-ready 状态
- **THEN** 卡片 SHALL 继续提供现有“查看详情”入口
- **AND** archive-ready 卡片 SHALL 继续提供现有“归档”入口

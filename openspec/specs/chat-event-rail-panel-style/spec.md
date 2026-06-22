# chat-event-rail-panel-style Specification

## Purpose

TBD - created by archiving change unify-chat-event-rail-panel-styles. Update Purpose after archive.

## Requirements

### Requirement: Chat EventRail 内 Panel Header 视觉统一

`ChatPlanPanel` 与 `ChatProposalPanel` 的 Section Header SHALL 使用一致的视觉与交互结构。

#### Scenario: 用户同时看到执行计划与会话提案

- **GIVEN** 当前 session 同时存在 plan entries 与 proposals
- **WHEN** `ChatSessionEventRail` 渲染
- **THEN** 两个 Panel 的 Header SHALL 均为可折叠按钮
- **AND** Header 左侧 SHALL 显示图标与中文标题
- **AND** Header 右侧 SHALL 显示计数与折叠 chevron
- **AND** 标题字号、字重、颜色、字间距 SHALL 一致

### Requirement: Chat EventRail Panel 标题使用中文

`ChatPlanPanel` 与 `ChatProposalPanel` 的标题 SHALL 使用简体中文，去除英文文案。

#### Scenario: 用户查看右侧事件栏

- **GIVEN** `ChatSessionEventRail` 渲染
- **WHEN** 用户查看 Panel 标题
- **THEN** `ChatPlanPanel` 标题 SHALL 为 "执行计划"
- **AND** `ChatProposalPanel` 标题 SHALL 为 "会话提案"

### Requirement: ChatProposalPanel 支持折叠

`ChatProposalPanel` SHALL 支持点击 Header 折叠/展开内容区。

#### Scenario: 用户收起会话提案

- **GIVEN** `ChatProposalPanel` 已展开
- **WHEN** 用户点击 Panel Header
- **THEN** proposal 卡片列表 SHALL 隐藏
- **AND** Header 右侧 chevron SHALL 指向下方

#### Scenario: 用户展开会话提案

- **GIVEN** `ChatProposalPanel` 已折叠
- **WHEN** 用户再次点击 Panel Header
- **THEN** proposal 卡片列表 SHALL 显示
- **AND** Header 右侧 chevron SHALL 指向上方

### Requirement: Chat EventRail 内多个 Panel 间距统一

当 `ChatSessionEventRail` 内同时渲染多个 Panel 时，Panel 之间的垂直间距 SHALL 一致。

#### Scenario: 同时存在执行计划与会话提案

- **GIVEN** `ChatPlanPanel` 与 `ChatProposalPanel` 同时渲染
- **WHEN** 用户查看 Rail 内容区
- **THEN** 两个 Panel 之间的外间距 SHALL 与 Rail 内容区 `space-y-*` 一致
- **AND** Panel 内部 Header 与内容区间的内间距 SHALL 一致

### Requirement: Panel 内容形态保持不变

统一 Header 后，`ChatPlanPanel` 与 `ChatProposalPanel` 的内容展示形态 SHALL 维持原有设计。

#### Scenario: 用户查看执行计划内容

- **GIVEN** `ChatPlanPanel` 展开
- **WHEN** 用户查看计划条目
- **THEN** 条目 SHALL 继续以无背景列表形式展示

#### Scenario: 用户查看会话提案内容

- **GIVEN** `ChatProposalPanel` 展开
- **WHEN** 用户查看 proposal item
- **THEN** item SHALL 继续以 `rounded-lg border border-default bg-default p-3` 卡片形式展示

### Requirement: ChatProposalPanel 卡片内状态 badge 不被挤压

`ChatProposalPanel` 卡片顶部布局 SHALL 保证右侧状态 badge 不被长 change id 挤压，且两侧间保留合理间距。

#### Scenario: 用户查看长 change id 的 proposal

- **GIVEN** 一个 proposal 的 change id 较长
- **WHEN** `ChatProposalPanel` 渲染该 proposal 卡片
- **THEN** 左侧标题与 change id SHALL 占剩余宽度并截断显示
- **AND** 右侧状态 badge SHALL 完整展示，不被挤压
- **AND** 左侧与右侧 SHALL 保留 `gap-2` 或 `gap-3`

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

### Requirement: 新 proposal 的 statusChanged 事件触发 proposalStore 刷新

当 renderer 收到 `proposal:statusChanged` 事件且对应 proposal 尚未加载到 `useProposalStore` 时，`useSessionStore` SHALL 先刷新 `useProposalStore`，再用完整 `ProposalMeta` 更新 `sessionProposals`。

#### Scenario: 用户首次通过状态推送看到新 proposal

- **GIVEN** 一个刚由 Agent 调用 `create-proposal` 创建的 proposal
- **AND** `useProposalStore` 中尚不存在该 proposal
- **WHEN** renderer 收到 `proposal:statusChanged` 推送
- **THEN** `useSessionStore` SHALL 调用 `useProposalStore().loadProposals()` 刷新列表
- **AND** 刷新完成后 `sessionProposals` 中该 proposal 的 `title` SHALL 来自 `useProposalStore` 中的完整 `ProposalMeta`
- **AND** `ChatProposalPanel` 加粗标题 SHALL 展示主进程生成的友好化标题，而非 raw change id

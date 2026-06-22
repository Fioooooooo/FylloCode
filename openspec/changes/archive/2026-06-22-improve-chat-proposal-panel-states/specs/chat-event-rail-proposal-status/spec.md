## MODIFIED Requirements

### Requirement: Chat EventRail 展示当前 session 的 proposal 列表

`ChatSessionEventRail` SHALL 展示与当前活跃 session 关联的所有 proposal，按创建时间倒序排列，并实时反映状态变化。
`ChatProposalPanel` SHALL 从 `ProposalMeta.status` 与当前匹配的 `ApplyRunMeta.status` 派生卡片展示态：

- `creating`：显示 badge “创建中”
- `draft`：显示 badge “草稿”
- `applying` 且没有匹配的 done apply run：显示 badge “实施中”
- `applying` 且 `proposalRunStore.runMeta.changeId === proposal.id` 且 `proposalRunStore.runMeta.status === "done"`：显示 badge “可归档”
- `applying` 且 `proposalRunStore.isArchiving === true` 且 `proposalRunStore.runMeta.changeId === proposal.id`：显示 badge “归档中”
- `archived`：显示 badge “已归档”

#### Scenario: 当前 session 有一个 draft proposal

- **GIVEN** 用户处于 `session-1`，该 session 已关联一个 `draft` proposal
- **WHEN** `ChatSessionEventRail` 渲染
- **THEN** rail SHALL 展示该 proposal 的标题、状态 badge 为“草稿”，并提供“开始实现”按钮

#### Scenario: proposal 状态实时更新

- **GIVEN** `ChatSessionEventRail` 已展示一个 `draft` proposal
- **WHEN** renderer 收到 `proposal:statusChanged` 事件，payload 中 `status` 变为 `applying`
- **THEN** rail 中对应 proposal 的状态 badge SHALL 立即更新为“实施中”，且“开始实现”按钮消失

#### Scenario: apply run 完成后显示可归档

- **GIVEN** `ChatSessionEventRail` 已展示一个 `applying` proposal
- **AND** `proposalRunStore.runMeta.changeId` 等于该 proposal id
- **AND** `proposalRunStore.runMeta.status === "done"`
- **WHEN** `ChatProposalPanel` 渲染该 proposal
- **THEN** 该 proposal 的状态 badge SHALL 显示“可归档”
- **AND** 该 proposal SHALL 显示“归档”按钮

#### Scenario: 点击归档后显示归档中

- **GIVEN** `ChatSessionEventRail` 已展示一个“可归档” proposal
- **WHEN** 用户点击“归档”按钮
- **AND** `proposalRunStore.isArchiving === true`
- **AND** `proposalRunStore.runMeta.changeId` 等于该 proposal id
- **THEN** 该 proposal 的状态 badge SHALL 显示“归档中”
- **AND** 该 proposal SHALL 不显示“归档”按钮
- **AND** 该 proposal SHALL 显示“查看详情”按钮

#### Scenario: 切换 session 后展示不同 proposal 列表

- **GIVEN** `session-1` 关联 proposal A，`session-2` 关联 proposal B
- **WHEN** 用户从 `session-1` 切换到 `session-2`
- **THEN** `ChatSessionEventRail` SHALL 隐藏 proposal A，展示 proposal B

### Requirement: 从 Chat EventRail 发起归档

对于派生展示态为“可归档”的 proposal，`ChatProposalPanel` SHALL 提供“归档”按钮，调用现有 archive 流程。
archive 成功完成后，renderer SHALL 刷新 proposal 元数据，并用刷新后的完整 `ProposalMeta` 更新当前 session 的
`sessionProposals`，使卡片收敛到 archived 状态。

#### Scenario: 实现完成后归档

- **GIVEN** 一个 `applying` 状态的 proposal
- **AND** `proposalRunStore.runMeta?.changeId === proposal.id`
- **AND** `proposalRunStore.runMeta?.status === "done"`
- **WHEN** 用户点击“归档”按钮
- **THEN** `ChatProposalPanel` SHALL 调用 `useProposalRunStore().startArchive(projectId, changeId)`
- **AND** archive 流程 SHALL 将目录移动到 archive
- **AND** renderer SHALL 刷新 `useProposalStore().loadProposals()`
- **AND** renderer SHALL 使用刷新后的 archived `ProposalMeta` 更新当前 session proposal
- **AND** `ProposalStatusService` SHALL 广播 `archived` 状态作为状态同步兜底

#### Scenario: archive 完成后不再显示归档按钮

- **GIVEN** 用户已从 `ChatProposalPanel` 成功归档 proposal `foo`
- **AND** 刷新后的 proposal 列表包含 `status === "archived"` 且 id 为 `foo` 或 `YYYY-MM-DD-foo` 的 proposal
- **WHEN** `ChatProposalPanel` 重新渲染该 proposal
- **THEN** 该 proposal 的状态 badge SHALL 显示“已归档”
- **AND** 该 proposal SHALL 不显示“归档”按钮
- **AND** 该 proposal SHALL 显示“查看详情”按钮

#### Scenario: 实现未完成时不显示归档按钮

- **GIVEN** 一个 `applying` 状态的 proposal
- **AND** 不存在 `changeId` 匹配且 `status === "done"` 的 `proposalRunStore.runMeta`
- **WHEN** `ChatProposalPanel` 渲染
- **THEN** 该 proposal SHALL 不显示“归档”按钮
- **AND** 该 proposal 的状态 badge SHALL 显示“实施中”

## MODIFIED Requirements

### Requirement: Chat EventRail 展示当前 session 的 proposal 列表

`ChatSessionEventRail` SHALL 展示与当前活跃 session 关联的所有 proposal，按创建时间倒序排列，并实时反映非终态 proposal 的状态变化。进入或切换到一个已存在的 session 时，renderer SHALL 通过 `lineage:getBySession` 读取该 session 的 proposal 产出列表，并用 `useProposalStore.proposals` 中的完整 `ProposalMeta` 回填 `useSessionStore.sessionProposals`。回填匹配 SHALL 使用 lineage 中的原始 `changeId`，并且 SHALL 同时匹配 `ProposalMeta.id === changeId` 与 archived proposal 的 `ProposalMeta.id === YYYY-MM-DD-<changeId>` 形式。

回填完成后，renderer SHALL 仅对 `status !== "archived"` 的 proposal 调用 `proposal:watch` 启动主进程状态监听；`archived` proposal SHALL 作为终态展示，不启动新的状态监听。

`ChatProposalPanel` SHALL 从 `ProposalMeta.status` 与当前匹配的 `ApplyRunMeta.status` 派生卡片展示态：

- `creating`：显示 badge “创建中”
- `draft`：显示 badge “已创建”
- `applying` 且没有匹配的 done apply run：显示 badge “实现中”
- `applying` 且 `proposalRunStore.runMeta.changeId === proposal.id` 且 `proposalRunStore.runMeta.status === "done"`：显示 badge “可归档”
- `applying` 且 `proposalRunStore.isArchiving === true` 且 `proposalRunStore.runMeta.changeId === proposal.id`：显示 badge “归档中”
- `archived`：显示 badge “已归档”

#### Scenario: 当前 session 有一个 draft proposal

- **GIVEN** 用户处于 `session-1`，该 session 已关联一个 `draft` proposal
- **WHEN** `ChatSessionEventRail` 渲染
- **THEN** rail SHALL 展示该 proposal 的标题、状态 badge 为“已创建”，并提供“开始实现”按钮

#### Scenario: proposal 状态实时更新

- **GIVEN** `ChatSessionEventRail` 已展示一个 `draft` proposal
- **WHEN** renderer 收到 `proposal:statusChanged` 事件，payload 中 `status` 变为 `applying`
- **THEN** rail 中对应 proposal 的状态 badge SHALL 立即更新为“实现中”，且“开始实现”按钮消失

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

#### Scenario: 重启后进入 session 恢复 active proposal 并启动 watch

- **GIVEN** FylloCode 重启后 renderer 内存中的 `sessionProposals` 为空
- **AND** lineage 中 `session-1` 的 proposal 列表包含 `changeId: "fix-login"`
- **AND** `useProposalStore.proposals` 包含 `{ id: "fix-login", status: "draft" }`
- **WHEN** 用户进入 `session-1`
- **THEN** `useSessionStore.sessionProposals["session-1"]` SHALL 包含该完整 `ProposalMeta`
- **AND** renderer SHALL 调用 `proposal:watch`，入参包含 `changeId: "fix-login"` 与 `sessionId: "session-1"`

#### Scenario: 重启后进入 session 恢复 archived proposal 且不启动 watch

- **GIVEN** FylloCode 重启后 renderer 内存中的 `sessionProposals` 为空
- **AND** lineage 中 `session-1` 的 proposal 列表包含 `changeId: "fix-login"`
- **AND** `useProposalStore.proposals` 包含 `{ id: "2026-06-25-fix-login", status: "archived" }`
- **WHEN** 用户进入 `session-1`
- **THEN** `useSessionStore.sessionProposals["session-1"]` SHALL 包含该 archived `ProposalMeta`
- **AND** renderer SHALL NOT 为 `2026-06-25-fix-login` 调用 `proposal:watch`

#### Scenario: 回填失败不阻断 session 切换

- **GIVEN** 用户进入 `session-1`
- **AND** `lineage:getBySession` 返回 `null`、错误响应或抛出异常
- **WHEN** `useSessionStore` 执行 proposal 回填
- **THEN** 当前 session SHALL 保持选中
- **AND** `sessionProposals["session-1"]` SHALL 保持为空
- **AND** renderer SHALL NOT 调用 `proposal:watch`

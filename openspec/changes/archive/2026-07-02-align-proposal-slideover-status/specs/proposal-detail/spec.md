## MODIFIED Requirements

### Requirement: Proposal 详情页 header 展示基础信息

详情 Slideover 顶部 SHALL 展示：proposal 标题、状态 badge、创建日期、任务完成进度，并提供关闭按钮。

状态 badge SHALL 从 `ProposalMeta.status` 与当前匹配的 `ApplyRunMeta` / archive run UI 状态派生，且 SHALL 不改变 `ProposalMeta.status` 的直接取值：

- `creating`：显示"创建中"
- `draft`：显示"已创建"
- `applying` 且没有匹配的 done apply run：显示"实现中"（高亮色）
- `applying` 且 `proposalRunStore.runMeta.changeId === 当前详情 proposal id` 且 `proposalRunStore.runMeta.status === "done"` 且 `proposalRunStore.isArchiving !== true`：显示"可归档"
- `applying` 且 `proposalRunStore.isArchiving === true` 且 `proposalRunStore.runMeta.changeId === 当前详情 proposal id`：显示"归档中"
- `archived`：显示"已归档"

`可归档` 与 `归档中` SHALL 仅作为详情 header 的 UI 展示态，不得写入 `.openspec.yaml`、`ProposalMeta.status` 或 IPC payload。

#### Scenario: Header 渲染元数据

- **WHEN** 用户打开 proposal 详情 Slideover
- **THEN** 顶部显示标题、状态 badge、日期和任务进度
- **AND** 顶部显示关闭按钮

#### Scenario: applying 状态的 badge

- **WHEN** proposal 的 status 为 `applying`
- **AND** 不存在 `changeId` 匹配且 `status === "done"` 的 `proposalRunStore.runMeta`
- **AND** `proposalRunStore.isArchiving !== true`
- **THEN** 状态 badge 显示"实现中"，使用高亮色（primary 色）

#### Scenario: apply run 完成后显示可归档

- **WHEN** proposal 的 status 为 `applying`
- **AND** `proposalRunStore.runMeta.changeId` 等于当前详情 proposal id
- **AND** `proposalRunStore.runMeta.status === "done"`
- **AND** `proposalRunStore.isArchiving !== true`
- **THEN** 状态 badge 显示"可归档"

#### Scenario: archive 运行中显示归档中

- **WHEN** proposal 的 status 为 `applying`
- **AND** `proposalRunStore.isArchiving === true`
- **AND** `proposalRunStore.runMeta.changeId` 等于当前详情 proposal id
- **THEN** 状态 badge 显示"归档中"

#### Scenario: 其他 proposal 的 done run 不影响当前详情

- **WHEN** 当前详情 proposal 的 id 为 `proposal-b`
- **AND** 当前详情 proposal 的 status 为 `applying`
- **AND** `proposalRunStore.runMeta.changeId === "proposal-a"`
- **AND** `proposalRunStore.runMeta.status === "done"`
- **THEN** 状态 badge 显示"实现中"
- **AND** 不显示"可归档"

### Requirement: 详情页提供 archive 入口

详情 Slideover SHALL 在 `status === "applying"` 且当前 proposal 匹配的 apply run 已完成时显示"归档"按钮；点击后触发归档流程。归档完成并刷新 proposal 元数据后，若 archived proposal 的 id 从原始 changeId 变为 `YYYY-MM-DD-<changeId>`，详情 Slideover SHALL 使用新的 id 重新读取 markdown 与 specs delta，而不是通过 router 替换 URL。

#### Scenario: apply run 已完成

- **WHEN** proposal.status 为 `applying`
- **AND** apply run 的 `changeId` 等于当前详情 proposal id
- **AND** apply run 的状态为 `done`
- **AND** archive 流未处于运行中
- **THEN** header 显示"归档"按钮
- **AND** 点击按钮触发 archive IPC

#### Scenario: apply run 仍在运行

- **WHEN** proposal.status 为 `applying` 但 apply run 的状态不是 `done`
- **THEN** header 不显示"归档"按钮

#### Scenario: apply run 属于其他 proposal

- **WHEN** 当前详情 proposal 的 id 为 `proposal-b`
- **AND** proposal.status 为 `applying`
- **AND** apply run 的 `changeId` 为 `proposal-a`
- **AND** apply run 的状态为 `done`
- **THEN** header 不显示"归档"按钮

#### Scenario: archive 后 patch 当前 Slideover changeId

- **WHEN** 归档完成后 `proposal:list` 返回 id 为 `YYYY-MM-DD-<changeId>` 的 archived proposal
- **THEN** 当前详情 Slideover 使用该 archived id 重新读取详情内容
- **AND** 应用 SHALL NOT 调用 `router.replace('/proposal/<archivedId>')`

## MODIFIED Requirements

### Requirement: Dynamic overview area preserves active proposal interactions

系统 SHALL 在动态数据区域展示进行中的提案，并保留现有 proposal 详情打开能力。

#### Scenario: Active proposal cards open proposal detail

- **WHEN** overview 页面展示进行中的提案
- **THEN** 每个可见提案 SHALL 展示提案标题、来源任务信息或自由讨论回退、proposal 状态和创建时间信息
- **AND** 当提案使用 linked worktree 且 active change metadata 包含 `worktreePath` 时，提案卡片 SHALL 展示 linked worktree icon
- **AND** 用户 hover 或 focus linked worktree icon 时 SHALL 能看到该提案使用的完整 `worktreePath`
- **AND** 当 active change metadata 没有 `worktreePath` 时，提案卡片 SHALL NOT 展示 linked worktree icon
- **AND** 用户点击提案卡片时 SHALL 打开对应 proposal detail slideover

#### Scenario: Active proposal status uses proposal model

- **WHEN** `overview:getProjectOverview` 返回 `activeChanges`
- **THEN** 每个 active change SHALL 暴露 proposal 的非归档状态，取值为 `creating`、`draft` 或 `applying`
- **AND** 系统 SHALL NOT 将这些状态映射为 overview 专属的 `drafting` 或 `proposal`
- **AND** 状态为 `archived` 的 proposal SHALL NOT 出现在 `activeChanges` 中

#### Scenario: Active proposal linked worktree metadata remains available

- **WHEN** `overview:getProjectOverview` 返回的 active change 对应一个使用 linked worktree 的 proposal
- **THEN** 该 active change SHALL 暴露与 proposal metadata 一致的 `worktreePath`
- **AND** 系统 SHALL 复用该 `worktreePath` 展示 overview active proposal 卡片的 linked worktree indicator

#### Scenario: Active proposals empty state remains explicit

- **WHEN** overview 数据中的 `activeChanges` 为空
- **THEN** 动态数据区域 SHALL 展示进行中提案的空状态
- **AND** 空状态 SHALL NOT 移除最近脉络区域或静态治理区域

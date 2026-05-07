## MODIFIED Requirements

### Requirement: Proposal detail header shows basic info

详情页 SHALL 展示：proposal 标题、状态 badge、创建日期、任务完成进度。

状态 badge 的显示规则：

- `draft`：默认状态，显示"草稿"
- `creating`：显示"创建中"
- `applying`：显示"实施中"（高亮色）
- `archived`：显示"已归档"

#### Scenario: Header renders metadata

- **WHEN** 用户进入详情页
- **THEN** 顶部显示标题、状态 badge、日期和任务进度

#### Scenario: applying 状态的 badge

- **WHEN** proposal 的 status 为 `applying`
- **THEN** 状态 badge 显示"实施中"，使用高亮色（primary 色）

### Requirement: 详情页提供 archive 入口

详情页 SHALL 在 `status === "applying"` 且 apply run 已完成时显示"归档"按钮；点击后触发归档流程。

#### Scenario: apply run completed

- **WHEN** proposal.status 为 `applying` 且 apply run 的状态为 `done`
- **THEN** header 显示"归档"按钮
- **AND** 点击按钮触发 archive IPC

#### Scenario: apply run still running

- **WHEN** proposal.status 为 `applying` 但 apply run 的状态不是 `done`
- **THEN** header 不显示"归档"按钮

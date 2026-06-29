## ADDED Requirements

### Requirement: 详情 Slideover 打开时刷新 proposal 元数据

Proposal 详情 Slideover SHALL 在每次打开时立即展示 store 中已有的 `ProposalMeta`，并在后台通过现有 `proposal:list` 路径刷新 `useProposalStore.proposals`。刷新完成后，header SHALL 自动使用刷新后的 store 数据更新标题、状态、创建日期与任务完成进度。系统 SHALL NOT 为该行为新增 `proposal:detail` IPC。

#### Scenario: 打开时先展示已有元数据并后台刷新

- **WHEN** 用户打开 proposal 详情 Slideover
- **AND** `useProposalStore.proposals` 中已有该 proposal 的旧 `ProposalMeta`
- **THEN** header 立即展示该旧元数据
- **AND** Slideover 发起一次 `useProposalStore.loadProposals()` 刷新
- **AND** 刷新完成后 header 展示刷新后的 `ProposalMeta`

#### Scenario: 刷新期间显示 loading icon

- **WHEN** Proposal 详情 Slideover 正在刷新 proposal 元数据
- **THEN** header 显示一个 loading icon
- **AND** loading icon 以旋转状态表达刷新进行中
- **WHEN** proposal 元数据刷新结束
- **THEN** header 不再显示该 loading icon

#### Scenario: 刷新后任务数量自动更新

- **WHEN** 打开详情时 store 中该 proposal 的 `doneTasks` 为 1 且 `totalTasks` 为 2
- **AND** 本次 `proposal:list` 刷新返回该 proposal 的 `doneTasks` 为 2 且 `totalTasks` 为 3
- **THEN** header 中的任务完成进度自动更新为 `2/3 tasks`

#### Scenario: 元数据刷新失败时保留已有 header

- **WHEN** 用户打开 proposal 详情 Slideover
- **AND** header 已经从 store 中展示了该 proposal 的 `ProposalMeta`
- **AND** 后台 `proposal:list` 刷新失败
- **THEN** header 继续展示刷新前已有的 proposal 元数据
- **AND** loading icon 停止显示
- **AND** markdown 文件读取与 Specs delta 读取不因元数据刷新失败而被阻断

#### Scenario: 不新增 detail IPC

- **WHEN** 用户打开 proposal 详情 Slideover
- **THEN** renderer 使用现有 `proposal:list` 刷新 proposal 元数据
- **AND** renderer 继续使用现有 `proposal:readFile` 读取 markdown 文件
- **AND** renderer 继续使用现有 `proposal:getSpecDeltas` 读取 Specs delta
- **AND** 系统不调用名为 `proposal:detail` 的 IPC channel

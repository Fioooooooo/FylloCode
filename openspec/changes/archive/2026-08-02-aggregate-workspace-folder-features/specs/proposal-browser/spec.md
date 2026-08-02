## MODIFIED Requirements

### Requirement: Proposal page presents the complete proposal list

系统 SHALL 将 `/proposal` 页面作为当前 Workspace 可用 Folder proposal 的完整聚合入口，不在页面顶部展示本地统计卡或状态 tabs。Main SHALL 为每个 Folder 返回 ready-empty、missing 或 error state，并在 partial failure 时保留其他 Folder proposals。列表、detail selection、IPC lookup 与 Vue key SHALL 使用完整 `ProposalRef`；跨 Folder 同名 change SHALL 同时展示并分别打开。

#### Scenario: Loaded proposal list is shown without local status filtering

- **WHEN** 用户打开 `/proposal` 且 browser aggregate 返回多个 Folder、多个状态的 proposal
- **THEN** 页面 SHALL 展示返回列表中的完整 proposal 集合
- **AND** 页面 SHALL NOT 展示页面级 proposal 数量统计卡
- **AND** 页面 SHALL NOT 展示按 proposal 状态过滤的 tabs

#### Scenario: 跨 Folder 同名 proposal 分别打开

- **WHEN** 列表包含 Folder A 和 Folder B 中 changeId 相同的 proposal
- **THEN** 两个卡片 SHALL 使用各自 ProposalRef 作为稳定 key
- **AND** 点击任一卡片 SHALL 以该 ProposalRef 打开现有 proposal detail slideover
- **AND** 系统 SHALL NOT 导航到新的 proposal 子路由或内嵌详情 pane

#### Scenario: Empty proposal list remains explicit

- **WHEN** `/proposal` 页面完整加载且所有 ready Folder 都没有 proposal
- **THEN** 页面 SHALL 展示 proposal 空状态
- **AND** 空状态 SHALL NOT 说明用户需要切换状态筛选条件

#### Scenario: One Folder proposal scan fails

- **WHEN** 一个 Folder proposal scan 失败而其他 Folder ready
- **THEN** 页面 SHALL 保留 ready Folder proposals
- **AND** SHALL 展示 partial warning 和失败 Folder
- **AND** SHALL NOT 把失败 Folder 表示为空

## ADDED Requirements

### Requirement: Proposal Folder filter preserves ProposalRef owner

`/proposal` 页面 SHALL 提供基于当前 aggregate Folder results 的 repository filter。Filter SHALL 控制可见 cards 和 Folder state，SHALL NOT 修改 proposal metadata、ProposalRef、detail owner 或 apply/archive target。

#### Scenario: User filters to secondary Folder

- **WHEN** 用户选择 secondary Folder filter
- **THEN** 页面 SHALL 只展示该 Folder 的 proposal cards 和状态
- **AND** 每个 card SHALL 继续显示 owner badge
- **AND** 点击 card SHALL 以原始 ProposalRef 打开详情

#### Scenario: Filtered Folder is missing

- **WHEN** 用户选择状态为 missing 的 Folder
- **THEN** 页面 SHALL 展示该 Folder 的 missing state
- **AND** SHALL NOT 回退 primary Folder proposals

#### Scenario: Workspace switch resets filter

- **WHEN** 当前 Workspace 发生变化
- **THEN** proposal store SHALL 清除旧 Folder filter 与 selection
- **AND** 前一 Workspace 的迟到 aggregate response SHALL NOT 覆盖新 Workspace state

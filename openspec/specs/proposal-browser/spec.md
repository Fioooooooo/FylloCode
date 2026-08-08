# proposal-browser Specification

## Purpose

定义 `/proposal` 页面作为当前项目 proposal 完整列表入口的行为，包括列表展示、详情打开、空状态、linked worktree 标识，以及避免用本地统计或状态 tabs 隐藏完整 proposal 集合。

## Requirements

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

### Requirement: Proposal cards indicate linked worktree usage

系统 SHALL 在proposal卡片展示owner Folder identity；当metadata的`worktreeMode`为`linked`时 SHALL 展示linked worktree indicator并允许查看完整`worktreePath`。EventRail持有的proposal卡片 SHALL 使用ProposalRef查找metadata，不能按裸changeId匹配其他Folder项。

#### Scenario: Proposal list card has linked worktree

- **WHEN**`/proposal`页面展示的proposal target为linked worktree
- **THEN**卡片 SHALL 展示owner Folder名称与linked worktree icon
- **AND**用户hover或focus icon时 SHALL 能看到完整worktreePath

#### Scenario: Main worktree proposal card

- **WHEN**proposal target的worktreeMode为main
- **THEN**卡片 SHALL 展示owner Folder名称
- **AND** SHALL NOT 展示linked worktree icon或为其保留可见占位

#### Scenario: EventRail proposal card resolves by ProposalRef

- **WHEN**EventRail展示Folder B的ProposalRef且Folder A存在同名change
- **THEN**卡片 SHALL 使用Folder B的metadata展示标题、状态、owner、创建时间、why与任务进度
- **AND** SHALL NOT 读取Folder A同名proposal的metadata或status

#### Scenario: Proposal status watcher is owner-qualified

- **WHEN**renderer同时watch同一Workspace中Folder A与Folder B的同名proposal
- **THEN**watcher SHALL 按WorkspaceId与完整ProposalRef分别发出、取消和清理状态事件
- **AND**一个owner的更新或移除 SHALL NOT 改写另一个owner的状态

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

# proposal-browser Specification

## Purpose

定义 `/proposal` 页面作为当前项目 proposal 完整列表入口的行为，包括列表展示、详情打开、空状态、linked worktree 标识，以及避免用本地统计或状态 tabs 隐藏完整 proposal 集合。

## Requirements

### Requirement: Proposal page presents the complete proposal list

系统 SHALL 将 `/proposal` 页面作为当前项目 proposal 的完整列表入口，不再在页面顶部展示本地统计卡或状态 tabs。

#### Scenario: Loaded proposal list is shown without local status filtering

- **WHEN** 用户打开 `/proposal` 且 `proposal:browser:list` 返回多个不同状态的 proposal
- **THEN** 页面 SHALL 展示返回列表中的完整 proposal 集合
- **AND** 页面 SHALL NOT 展示页面级 proposal 数量统计卡
- **AND** 页面 SHALL NOT 展示用于按 proposal 状态过滤列表的 tabs

#### Scenario: Proposal card still opens proposal detail

- **WHEN** 用户点击 `/proposal` 页面中的 proposal 卡片
- **THEN** 系统 SHALL 使用该 proposal 的 `id` 打开现有 proposal detail slideover
- **AND** 系统 SHALL NOT 导航到新的 proposal 子路由或内嵌详情 pane

#### Scenario: Empty proposal list remains explicit

- **WHEN** `/proposal` 页面加载成功且 `proposal:browser:list` 返回空列表
- **THEN** 页面 SHALL 展示 proposal 空状态
- **AND** 空状态 SHALL NOT 说明用户需要切换筛选条件

### Requirement: Proposal cards indicate linked worktree usage

系统 SHALL 在 proposal 卡片使用的 proposal metadata 包含 `worktreePath` 时展示 linked worktree indicator，并允许用户查看实际 worktree 路径。

#### Scenario: Proposal list card has linked worktree

- **WHEN** `/proposal` 页面展示的 proposal metadata 包含非空 `worktreePath`
- **THEN** 该 proposal 卡片 SHALL 展示 linked worktree icon
- **AND** 用户 hover 或 focus 该 icon 时 SHALL 能看到该 proposal 使用的完整 `worktreePath`

#### Scenario: EventRail proposal card has linked worktree

- **WHEN** 对话页 EventRail 的 proposal 卡片 metadata 包含非空 `worktreePath`
- **THEN** 该 proposal 卡片 SHALL 展示 linked worktree icon
- **AND** 用户 hover 或 focus 该 icon 时 SHALL 能看到该 proposal 使用的完整 `worktreePath`

#### Scenario: EventRail proposal card shows proposal context

- **WHEN** 对话页 EventRail 展示 proposal 卡片
- **THEN** 该 proposal 卡片 SHALL 展示 proposal 标题、状态和创建时间信息
- **AND** 创建时间信息 SHALL 使用与 overview active change 一致的 `timeAgo` 文案，且 SHALL NOT 添加固定的“创建于”前缀
- **AND** 当 proposal metadata 包含非空 `why` 摘要时，卡片 SHALL 展示该摘要而不是 `changeId`
- **AND** 当 `totalTasks` 大于 0 时，卡片 SHALL 展示 `doneTasks/totalTasks` 任务进度
- **AND** 卡片 SHALL NOT 将 `changeId` 作为主要用户可见描述文本

#### Scenario: Proposal card has no linked worktree

- **WHEN** proposal metadata 没有 `worktreePath`
- **THEN** 对应 proposal 卡片 SHALL NOT 展示 linked worktree icon
- **AND** 卡片布局 SHALL NOT 为缺失的 linked worktree indicator 保留可见占位

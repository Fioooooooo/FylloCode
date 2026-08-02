# proposal-browser Specification

## Purpose

定义 `/proposal` 页面作为当前项目 proposal 完整列表入口的行为，包括列表展示、详情打开、空状态、linked worktree 标识，以及避免用本地统计或状态 tabs 隐藏完整 proposal 集合。

## Requirements

### Requirement: Proposal page presents the complete proposal list

系统 SHALL 将 `/proposal` 页面作为当前 Workspace 可用 Folder proposal 的完整列表入口，不在页面顶部展示本地统计卡或状态 tabs。列表、detail selection、IPC lookup与Vue key SHALL 使用完整ProposalRef；跨Folder同名change SHALL 同时展示并分别打开。

#### Scenario: Loaded proposal list is shown without local status filtering

- **WHEN**用户打开`/proposal`且browser list返回多个Folder、多个状态的proposal
- **THEN**页面 SHALL 展示返回列表中的完整proposal集合
- **AND**页面 SHALL NOT 展示页面级proposal数量统计卡
- **AND**页面 SHALL NOT 展示按proposal状态过滤的tabs

#### Scenario: 跨 Folder 同名 proposal 分别打开

- **WHEN**列表包含Folder A和Folder B中changeId相同的proposal
- **THEN**两个卡片 SHALL 使用各自ProposalRef作为稳定key
- **AND**点击任一卡片 SHALL 以该ProposalRef打开现有proposal detail slideover
- **AND**系统 SHALL NOT 导航到新的proposal子路由或内嵌详情pane

#### Scenario: Empty proposal list remains explicit

- **WHEN**`/proposal`页面加载成功且所有可读Folder都没有proposal
- **THEN**页面 SHALL 展示proposal空状态
- **AND**空状态 SHALL NOT 说明用户需要切换筛选条件

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

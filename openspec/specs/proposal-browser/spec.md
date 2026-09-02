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

系统 SHALL 让 Proposal 详情 Slideover 保持只读浏览，不得在详情头部提供 workflow Apply、Archive 或查看旧运行历史的操作按钮，也不得挂载仅服务旧 `WorkflowStage` stage-stream 的运行 side panel。详情 SHALL 继续展示 Proposal 内容、owner、status badge、任务信息和由 Proposal metadata 派生的状态；Apply/Archive 的真实反馈由 Chat/tool result 和 Proposal watcher/status push 承担。

Chat Event Rail 的“开始实现”和“归档”按钮 SHALL 继续遵守本 capability 中已有的 Chat message 契约：按钮发送单个带完整 `ProposalRef` 的文字消息，组件不得直接调用已删除的 Proposal run store/API。任务完成度派生的 `archiveReady` 规则 SHALL 不依赖 Workflow Run 或旧 runMeta。

#### Scenario: 用户打开 draft Proposal 详情

- **WHEN** 用户打开状态为 `draft` 的 Proposal 详情 Slideover
- **THEN** 详情头部 SHALL 不展示“开始实现”按钮或 workflow dropdown
- **AND** 详情内容、owner、状态和任务信息 SHALL 继续展示
- **AND** SHALL 不加载旧 apply/archive run 或旧 WorkflowStage metadata

#### Scenario: 用户打开 applying 或 archived Proposal 详情

- **WHEN** 用户打开状态为 `applying` 或 `archived` 的 Proposal 详情 Slideover
- **THEN** 详情头部 SHALL 不展示“归档”或“查看运行历史”按钮
- **AND** SHALL 不显示 `ProposalApplySidePanel` 或旧 stage progress
- **AND** Proposal status、task progress 和文件内容 SHALL 继续按现有 browser/watcher 规则展示

#### Scenario: Chat Apply/Archive 正在由 Agent 执行

- **WHEN** Event Rail 已发送 Apply/Archive Chat 消息但 Proposal metadata 尚未变化
- **THEN** detail 与 Event Rail SHALL 保持 watcher 最近确认的状态
- **AND** SHALL 不通过旧 run store 乐观创建“运行中”或“归档中”状态
- **AND** Agent 的工具结果 SHALL 继续在 Chat 消息流中可见

#### Scenario: Apply 完成后可归档状态继续派生

- **WHEN** Proposal status 为 `applying`、totalTasks 大于零且 doneTasks 等于 totalTasks
- **THEN** detail 与 Event Rail SHALL 继续派生 `archiveReady`
- **AND** 该结果 SHALL 不要求 matching ApplyRunMeta、WorkflowStage 或旧 workflow engine

### Requirement: Event Rail 通过 Chat 用户消息发起 Proposal Apply

Chat Event Rail SHALL 为状态为 `draft` 的 Proposal 卡片展示直接“开始实现”按钮，不得展示 workflow dropdown，且该按钮 SHALL NOT 配置操作 icon。用户点击该按钮时，renderer SHALL 调用现有 `chatStore.sendMessage` 并发送单个 text part，文本 SHALL 为 `Start applying proposal: <changeId> (folderId: <folderId>)`，其中两个占位符来自卡片的完整 `ProposalRef`。该消息 SHALL 通过现有 Chat 流水线作为 `role=user` 消息进入当前会话，组件 SHALL NOT 直接调用已删除的 Proposal run API 或 stage-stream 启动 Apply。

#### Scenario: 用户从 Event Rail 发起 draft Proposal Apply

- **WHEN** 用户点击 draft Proposal 卡片的“开始实现”按钮
- **THEN** 系统 SHALL 调用 `chatStore.sendMessage` 并传入一个 text part
- **AND** text SHALL 同时包含该 Proposal 的 `changeId` 与 owner `folderId`
- **AND** 系统 SHALL NOT 要求用户选择 workflow
- **AND** 组件 SHALL NOT 直接调用 Proposal run API 或 stage-stream

#### Scenario: Event Rail 的 Apply 入口使用纯文字按钮

- **WHEN** Event Rail 展示 draft Proposal 卡片的“开始实现”按钮
- **THEN** 按钮 SHALL 展示“开始实现”文字
- **AND** 按钮 SHALL NOT 配置 play icon 或其他操作 icon

#### Scenario: Event Rail 保持其他 Proposal 操作

- **WHEN** Proposal 卡片可查看详情或达到 archive-ready 状态
- **THEN** 卡片 SHALL 继续提供现有“查看详情”入口
- **AND** archive-ready 卡片 SHALL 继续提供“归档”入口

### Requirement: Event Rail 通过 Chat 用户消息发起 Proposal Archive

Chat Event Rail SHALL 仅为展示状态为 `archiveReady` 的 Proposal 卡片提供“归档”按钮，且该按钮 SHALL NOT 配置操作 icon。用户点击该按钮时，renderer SHALL 调用现有 `chatStore.sendMessage` 并发送单个 text part，文本 SHALL 为 `Start archiving proposal: <changeId> (folderId: <folderId>)`，其中两个占位符来自卡片的完整 `ProposalRef`。该消息 SHALL 通过现有 Chat 流水线作为 `role=user` 消息进入当前会话；组件 SHALL NOT 直接启动已删除的 Archive run API、立即刷新 Proposal Store 或主动修改 Session Proposal。

实际 Archive 改变 Proposal 状态后，系统 SHALL 继续通过现有 Main Proposal watcher 与 IPC status push 更新或移除对应 Session Proposal，且状态事件 SHALL 使用完整 `ProposalRef` 保持 owner 隔离。Watcher SHALL 将 Proposal target视为可迁移位置：linked Proposal归档、合并到 owner main并删除linked worktree时，系统 SHALL 重新定位到main archive并更新卡片，不得把该迁移解释为Proposal removed。

#### Scenario: 用户从 Event Rail 发起 archive-ready Proposal Archive

- **WHEN** 用户点击 archive-ready Proposal 卡片的“归档”按钮
- **THEN** 系统 SHALL 调用 `chatStore.sendMessage` 并传入一个 text part
- **AND** text SHALL 为 `Start archiving proposal: <changeId> (folderId: <folderId>)`
- **AND** `changeId` 与 `folderId` SHALL 来自被点击卡片的完整 `ProposalRef`
- **AND** 组件 SHALL NOT 调用 Archive run API 或 stage-stream
- **AND** 组件 SHALL NOT 因消息发送完成而立即调用 `proposalStore.loadProposals` 或 `sessionStore.upsertSessionProposal`

#### Scenario: Event Rail 的 Archive 入口使用纯文字按钮

- **WHEN** Event Rail 展示 archive-ready Proposal 卡片的“归档”按钮
- **THEN** 按钮 SHALL 展示“归档”文字
- **AND** 按钮 SHALL NOT 配置 archive icon 或其他操作 icon

#### Scenario: 实际归档完成后更新 Session Proposal

- **WHEN** Agent 后续完成实际 Archive，Main Proposal watcher 检测到对应 Proposal 状态或目录发生变化
- **THEN** Main SHALL 向对应 Workspace 推送包含完整 `ProposalRef` 的状态事件
- **AND** Renderer SHALL 重新加载 Proposal aggregate并根据该事件更新对应 Proposal Store与Session Proposal
- **AND** 一个 Folder 的归档状态 SHALL NOT 改写另一个 Folder 的同名 Proposal

#### Scenario: Linked Proposal归档后迁移到main

- **WHEN** linked Proposal已进入linked archive，随后其commit合并到owner main且linked worktree被删除
- **THEN** Main SHALL 将owner main archive识别为相同ProposalRef的稳定位置
- **AND** Main SHALL 将watcher重绑到main archive并推送`status: archived`
- **AND** SHALL NOT因为旧linked路径消失而发送`removed: true`
- **AND** Renderer SHALL 使用重新加载的metadata将该Proposal的`worktreeMode/worktreePath`更新为main目标

#### Scenario: Linked archive的Git finalization失败

- **WHEN** OpenSpec archive已成功但commit、merge或worktree cleanup失败，Proposal仍位于linked archive
- **THEN** Main SHALL继续将该Proposal识别为`archived`
- **AND** Event Rail MAY展示“已归档”，Git失败与恢复信息由Chat/tool result承载
- **AND**系统SHALL NOT新增或推导“归档中”或“归档失败”Proposal lifecycle status

#### Scenario: Proposal位置事件暂时无法解析

- **WHEN** location watcher收到rename、空filename、重复事件或旧linked watcher error
- **AND**当前target与owner main archive在首次检查时暂时都不可见
- **THEN** Main SHALL进行有界重新解析并保留现有Session Proposal
- **AND**只有在重试后所有授权位置仍不存在时才MAY发送`removed: true`

#### Scenario: Chat 消息尚未触发实际归档

- **WHEN** “归档”消息已经发送但 Proposal 状态尚未实际改变
- **THEN** Event Rail SHALL 保持 watcher 最近确认的 Proposal 状态
- **AND** 系统 SHALL NOT 乐观展示“归档中”或“已归档”状态

### Requirement: Proposal 可归档状态由任务完成度统一派生

Renderer SHALL 在 Proposal status 为 `applying`、`totalTasks > 0` 且 `doneTasks === totalTasks` 时将展示状态派生为 `archiveReady`。该判断 SHALL NOT 依赖 Workflow Run、旧 run metadata 或 stage completion。Proposal detail Slideover 与 Chat Event Rail SHALL 复用同一展示状态规则；任务未全部完成或任务总数为零时 SHALL 保持 `applying` 展示状态且 Event Rail SHALL NOT 展示“归档”按钮。

#### Scenario: Chat Apply 的所有任务已完成

- **WHEN** Proposal status 为 `applying`、任务总数大于零且所有任务均已勾选
- **THEN** Proposal detail Slideover SHALL 展示“可归档”状态
- **AND** Chat Event Rail SHALL 展示“可归档”状态与“归档”按钮
- **AND** 结果 SHALL NOT 取决于 Renderer 是否存在 Workflow Run 或旧 run metadata

#### Scenario: Chat Apply 仍有未完成任务

- **WHEN** Proposal status 为 `applying` 且 `doneTasks < totalTasks`
- **THEN** Proposal detail Slideover 与 Chat Event Rail SHALL 继续展示“实现中”
- **AND** Chat Event Rail SHALL NOT 展示“归档”按钮

#### Scenario: Proposal 没有可执行任务

- **WHEN** Proposal status 为 `applying` 且 `totalTasks` 为零
- **THEN** 系统 SHALL NOT 将 `doneTasks === totalTasks` 解释为可归档
- **AND** Event Rail SHALL NOT 展示“归档”按钮

### Requirement: Proposal 任务元数据变化实时刷新 Session Proposal

Main Proposal watcher SHALL 感知被 watch Proposal 目录中的 `.openspec.yaml` 与 `tasks.md` 变化，并通过现有 Proposal statusChanged IPC channel 向对应 Workspace 广播 owner-qualified `ProposalStatusChangedPayload`。Payload SHALL 使用 `changeKind: "status" | "tasks"` 显式区分生命周期状态变化与任务元数据变化；`tasks` 事件 SHALL 携带 Proposal 当前真实 status，不得创造新的生命周期状态。

Renderer 收到 `changeKind: "tasks"` 后 SHALL 重新加载当前 Workspace 的 Proposal aggregate，按完整 `ProposalRef` 查找最新 Proposal，并将最新 `doneTasks/totalTasks` upsert 到事件指定的 Session Proposal。刷新失败或目标暂时缺失时 SHALL 保留旧 Session Proposal，不得误删卡片或影响其他 Folder 的同名 Proposal。

Renderer 收到 `changeKind: "status"` 且 `status: archived` 后 SHALL 同样重新加载当前 Workspace的Proposal aggregate，并按完整`ProposalRef`同步Proposal Store与事件指定的Session Proposal。刷新失败或目标暂时缺失时 SHALL保留旧Session Proposal；不得使用旧linked target覆盖已经解析到的main archive，也不得影响其他Folder的同名Proposal。

#### Scenario: tasks.md 最后一个任务被勾选

- **WHEN** watched Proposal 的 `tasks.md` 变化且任务完成度变为全部完成
- **THEN** Main SHALL 发送 `changeKind: "tasks"` 且 status 为当前 Proposal status 的事件
- **AND** Renderer SHALL 重新加载 Proposal aggregate
- **AND** 对应 Session Proposal SHALL 获得最新任务计数并派生为 `archiveReady`

#### Scenario: 其他 Folder 存在同名 Proposal

- **WHEN** Folder A 的 `tasks.md` 变化且 Folder B 存在相同 changeId
- **THEN** 状态事件 SHALL 携带 Folder A 的完整 ProposalRef
- **AND** Renderer SHALL 只更新 Folder A 对应的 Session Proposal

#### Scenario: 任务元数据刷新失败

- **WHEN** Renderer 收到 `changeKind: "tasks"` 事件但 Proposal aggregate 重新加载失败
- **THEN** Renderer SHALL 保留事件前的 Session Proposal
- **AND** SHALL NOT 将该 Proposal 视为 removed 或改写其他 Proposal

#### Scenario: Archived状态事件刷新跨worktree metadata

- **WHEN** Renderer收到完整ProposalRef的`changeKind: "status"`与`status: archived`事件
- **THEN** Renderer SHALL重新加载Proposal aggregate
- **AND** SHALL将最新status、worktree mode与worktree path upsert到对应Session Proposal
- **AND**聚合刷新失败时SHALL保留旧卡片并等待后续事件或用户刷新

## Implementation mapping

- Proposal detail and display projection：`src/renderer/src/components/proposal/ProposalDetailSlideover.vue`、`ProposalDetailHeader.vue`、`src/renderer/src/utils/proposal-display-status.ts`。
- Chat Event Rail and owner-qualified watcher path：`src/renderer/src/components/chat/event/ChatProposalPanel.vue`、`src/main/services/proposal/browser/**`、`src/shared/types/proposal.ts`。
- Acceptance tests：`test/renderer/src/pages/proposal-detail.spec.ts`、`test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`、`test/renderer/src/components/proposal-detail-header.spec.ts`、`test/main/services/proposal/browser/**`、`test/main/services/proposal/browser/proposal-service.spec.ts`。

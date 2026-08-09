## MODIFIED Requirements

### Requirement: Event Rail 通过 Chat 用户消息发起 Proposal Apply

Chat Event Rail SHALL 为状态为 `draft` 的 Proposal 卡片展示直接“开始实现”按钮，不得展示 workflow dropdown，且该按钮 SHALL NOT 配置操作 icon。用户点击该按钮时，renderer SHALL 调用现有 `chatStore.sendMessage` 并发送单个 text part，文本 SHALL 为 `Start applying proposal: <changeId> (folderId: <folderId>)`，其中两个占位符来自卡片的完整 `ProposalRef`。该消息 SHALL 通过现有 Chat 流水线作为 `role=user` 消息进入当前会话，组件 SHALL NOT 直接调用 Proposal run store 启动 Apply。

#### Scenario: 用户从 Event Rail 发起 draft Proposal Apply

- **WHEN** 用户点击 draft Proposal 卡片的“开始实现”按钮
- **THEN** 系统 SHALL 调用 `chatStore.sendMessage` 并传入一个 text part
- **AND** text SHALL 同时包含该 Proposal 的 `changeId` 与 owner `folderId`
- **AND** 系统 SHALL NOT 要求用户选择 workflow
- **AND** 组件 SHALL NOT 直接调用 `proposalRunStore.startRun`

#### Scenario: Event Rail 的 Apply 入口使用纯文字按钮

- **WHEN** Event Rail 展示 draft Proposal 卡片的“开始实现”按钮
- **THEN** 按钮 SHALL 展示“开始实现”文字
- **AND** 按钮 SHALL NOT 配置 play icon 或其他操作 icon

#### Scenario: Event Rail 保持其他 Proposal 操作

- **WHEN** Proposal 卡片可查看详情或达到 archive-ready 状态
- **THEN** 卡片 SHALL 继续提供现有“查看详情”入口
- **AND** archive-ready 卡片 SHALL 继续提供“归档”入口

## ADDED Requirements

### Requirement: Event Rail 通过 Chat 用户消息发起 Proposal Archive

Chat Event Rail SHALL 仅为展示状态为 `archiveReady` 的 Proposal 卡片提供“归档”按钮，且该按钮 SHALL NOT 配置操作 icon。用户点击该按钮时，renderer SHALL 调用现有 `chatStore.sendMessage` 并发送单个 text part，文本 SHALL 为 `Start archiving proposal: <changeId> (folderId: <folderId>)`，其中两个占位符来自卡片的完整 `ProposalRef`。该消息 SHALL 通过现有 Chat 流水线作为 `role=user` 消息进入当前会话；组件 SHALL NOT 直接启动 Archive、立即刷新 Proposal Store 或主动修改 Session Proposal。

实际 Archive 改变 Proposal 状态后，系统 SHALL 继续通过现有 Main Proposal watcher 与 IPC status push 更新或移除对应 Session Proposal，且状态事件 SHALL 使用完整 `ProposalRef` 保持 owner 隔离。Watcher SHALL 将 Proposal target视为可迁移位置：linked Proposal归档、合并到 owner main并删除linked worktree时，系统 SHALL 重新定位到main archive并更新卡片，不得把该迁移解释为Proposal removed。

#### Scenario: 用户从 Event Rail 发起 archive-ready Proposal Archive

- **WHEN** 用户点击 archive-ready Proposal 卡片的“归档”按钮
- **THEN** 系统 SHALL 调用 `chatStore.sendMessage` 并传入一个 text part
- **AND** text SHALL 为 `Start archiving proposal: <changeId> (folderId: <folderId>)`
- **AND** `changeId` 与 `folderId` SHALL 来自被点击卡片的完整 `ProposalRef`
- **AND** 组件 SHALL NOT 调用 `proposalRunStore.startArchive`
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

Renderer SHALL 在 Proposal status 为 `applying`、`totalTasks > 0` 且 `doneTasks === totalTasks` 时将展示状态派生为 `archiveReady`。该判断 SHALL NOT 依赖 `proposalRunStore.runMeta`、run status 或 workflow completion。Proposal detail Slideover 与 Chat Event Rail SHALL 复用同一展示状态规则；任务未全部完成或任务总数为零时 SHALL 保持 `applying` 展示状态且 Event Rail SHALL NOT 展示“归档”按钮。

#### Scenario: Chat Apply 的所有任务已完成

- **WHEN** Proposal status 为 `applying`、任务总数大于零且所有任务均已勾选
- **THEN** Proposal detail Slideover SHALL 展示“可归档”状态
- **AND** Chat Event Rail SHALL 展示“可归档”状态与“归档”按钮
- **AND** 结果 SHALL NOT 取决于 Renderer 是否存在 matching runMeta

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

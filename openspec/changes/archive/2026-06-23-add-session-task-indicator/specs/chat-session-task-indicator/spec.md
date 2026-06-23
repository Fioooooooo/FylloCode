## ADDED Requirements

### Requirement: Session item 标识已关联任务

系统 SHALL 在 chat session 列表项中，当且仅当 `Session.originTaskRef` 非空时展示一个常驻任务图标，用于表示该会话已经关联任务。该图标 SHALL 使用统一任务语义图标，不根据任务来源切换平台图标。

#### Scenario: 关联任务的 session item 展示任务图标

- **WHEN** session 列表渲染一个 `originTaskRef` 为 `yunxiao:STORY-42` 的会话
- **THEN** 该 session item 展示任务图标
- **AND** 图标使用统一任务语义图标

#### Scenario: 未关联任务的 session item 不展示任务图标

- **WHEN** session 列表渲染一个 `originTaskRef` 为 `undefined` 的会话
- **THEN** 该 session item 不展示任务图标
- **AND** 该 session item 保持现有标题、时间和 turn 数布局

### Requirement: 任务图标 hover popover 展示来源和标题

系统 SHALL 在用户 hover session item 的任务图标时展示 popover。popover SHALL 展示任务来源 source 和任务标题 title。source SHALL 从 `Session.originTaskRef` 的 source 段本地解析，并支持 `local`、`yunxiao`、`github` 三种来源标签，分别显示为 `本地`、`云效`、`GitHub`。title SHALL 来自 lineage subject 的 `LineageTaskSnapshot.snapshot.title`，SHALL NOT 来自实时 `taskApi.getTask`。

系统 SHALL 复用现有 `lineage:getByTask` 获取 task snapshot，SHALL NOT 新增 IPC，SHALL NOT 扩展 `chat:listSessions` 返回结构。系统 SHALL 只在用户 hover/open popover 时懒加载标题，SHALL NOT 在 session 列表加载时批量预取所有关联任务标题。

#### Scenario: 云效任务 popover 展示来源和标题

- **WHEN** 用户 hover 一个 `originTaskRef` 为 `yunxiao:STORY-42` 的 session item 任务图标
- **AND** `lineage:getByTask` 返回的 task snapshot title 为 `支持 session item 任务提示`
- **THEN** popover 展示来源 `云效`
- **AND** popover 展示标题 `支持 session item 任务提示`

#### Scenario: 本地任务 popover 展示来源和标题

- **WHEN** 用户 hover 一个 `originTaskRef` 为 `local:task-1` 的 session item 任务图标
- **AND** `lineage:getByTask` 返回的 task snapshot title 为 `修正 session 列表任务提示`
- **THEN** popover 展示来源 `本地`
- **AND** popover 展示标题 `修正 session 列表任务提示`

#### Scenario: GitHub 任务 popover 展示来源和标题

- **WHEN** 用户 hover 一个 `originTaskRef` 为 `github:repo-1:42` 的 session item 任务图标
- **AND** `lineage:getByTask` 返回的 task snapshot title 为 `Track linked sessions`
- **THEN** popover 展示来源 `GitHub`
- **AND** popover 展示标题 `Track linked sessions`

#### Scenario: 首次 hover 时懒加载标题

- **WHEN** session 列表已渲染一个 `originTaskRef` 非空且未缓存任务信息的会话
- **AND** 用户尚未 hover 该会话的任务图标
- **THEN** 系统不调用 `lineage:getByTask`
- **WHEN** 用户首次 hover 该任务图标
- **THEN** 系统调用一次 `lineage:getByTask`
- **AND** 将解析出的来源与标题写入 session store 缓存

#### Scenario: 已缓存任务信息时不重复请求

- **WHEN** 某 session 的任务信息已存在于 session store 缓存
- **AND** 用户 hover 该 session item 的任务图标
- **THEN** popover 直接展示缓存中的来源与标题
- **AND** 不再次调用 `lineage:getByTask`

#### Scenario: task snapshot 缺失时降级展示 ref

- **WHEN** 用户 hover 一个 `originTaskRef` 为 `yunxiao:STORY-404` 的 session item 任务图标
- **AND** `lineage:getByTask` 返回 `null` 或失败
- **THEN** popover 展示来源 `云效`
- **AND** popover 将标题降级展示为 `yunxiao:STORY-404`
- **AND** 不阻断 session 列表交互

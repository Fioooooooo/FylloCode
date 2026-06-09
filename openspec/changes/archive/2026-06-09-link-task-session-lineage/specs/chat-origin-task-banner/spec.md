## ADDED Requirements

### Requirement: 对话页顶部展示当前会话关联的任务来源条

系统 SHALL 在 ChatContainer 顶部以吸顶（sticky）方式展示当前活跃会话关联的任务来源条，当且仅当该会话的 `Session.originTaskRef` 非空时展示。来源条 SHALL 展示任务来源（source）与任务标题（title）。会话未关联任务（`originTaskRef` 为 `undefined`）时 SHALL NOT 展示来源条，且不占用顶部布局空间。

任务来源（source）SHALL 从 `originTaskRef` 字符串本地解析（`<source>:<id>` 的 source 段），不发起请求。任务标题（title）SHALL 来自 lineage subject 的 `LineageTaskSnapshot.snapshot.title`，SHALL NOT 来自实时 `taskApi.getTask`，以保证第三方任务关闭后仍可展示。

#### Scenario: 关联任务的会话展示来源条

- **WHEN** 用户切换到一个 `originTaskRef` 为 `yunxiao:STORY-42` 的会话
- **THEN** ChatContainer 顶部展示吸顶来源条
- **AND** 来源标识解析自 ref 的 source 段（`yunxiao`）
- **AND** 标题取自该 ref 对应 lineage subject 的 `task.snapshot.title`

#### Scenario: 未关联任务的会话不展示来源条

- **WHEN** 用户切换到一个 `originTaskRef` 为 `undefined` 的会话
- **THEN** ChatContainer 顶部不展示来源条
- **AND** 不调用 `lineage:getByTask`

#### Scenario: 第三方任务已关闭仍可展示

- **WHEN** 会话关联的第三方任务已在源侧关闭、`taskApi.getTask` 不再返回该任务
- **AND** 用户切换到该会话
- **THEN** 来源条仍从 lineage subject 快照展示来源与标题

### Requirement: session store 懒加载并缓存关联任务信息

系统 SHALL 在 session store 维护内存缓存 `taskInfoBySessionId`，存储每个 session 解析后的关联任务展示信息（来源 + 标题）。`selectSession` 时若目标 session 的 `originTaskRef` 非空且该 sessionId 未在缓存中，系统 SHALL 调用 `lineage:getByTask` 获取 subject 快照、解析出展示信息并写入缓存。已缓存的 session 再次切换 SHALL NOT 重复发起 `lineage:getByTask`。

该缓存 SHALL 复刻 session messages 的懒加载缓存模式（参照 `selectSession` 对 `loadedSessionIds` 的处理），为内存态、不持久化。

#### Scenario: 首次切换关联会话时懒加载

- **WHEN** 用户首次切换到一个 `originTaskRef` 非空且未缓存的会话
- **THEN** session store 调用 `lineage:getByTask` 获取 subject 快照
- **AND** 把解析出的来源与标题写入 `taskInfoBySessionId`

#### Scenario: 再次切换已缓存会话零请求

- **WHEN** 用户切换到一个其任务信息已在 `taskInfoBySessionId` 中的会话
- **THEN** 直接使用缓存展示来源条
- **AND** 不再调用 `lineage:getByTask`

#### Scenario: getByTask 返回 null 时降级

- **WHEN** 切换关联会话时 `lineage:getByTask` 返回 `null`（subject 缺失）
- **THEN** 来源条降级为仅展示从 ref 解析的来源与原始 ref 文本（如 `yunxiao:STORY-42`）
- **AND** 不阻断会话切换或对话

## MODIFIED Requirements

### Requirement: 对话页顶部展示当前会话关联的任务来源条

系统 SHALL 在 ChatContainer 顶部以吸顶（sticky）方式展示当前活跃会话关联的任务来源条，当且仅当该会话的 `Session.originTaskRef` 非空时展示。来源条 SHALL 展示任务来源（source）与任务标题（title）。会话未关联任务（`originTaskRef` 为 `undefined`）时 SHALL NOT 展示来源条，且不占用顶部布局空间。

任务来源（source）SHALL 从 `originTaskRef` 字符串本地解析（`<source>:<id>` 的 source 段），不发起请求。任务标题（title）SHALL 来自 lineage subject 的 `LineageTaskSnapshot.snapshot.title`，SHALL NOT 来自实时 `taskApi.getTask`，以保证第三方任务关闭后仍可展示。

`originTaskRef` 可能指向两类任务：

- 上游来源任务：用户从任务页发起讨论时传入的 `taskRef`。
- 下游创建任务：用户在该会话中通过 `fyllo-action task.create` 创建的任务。

无论哪种来源，`OriginTaskBanner` SHALL 使用同一套展示逻辑，不区分来源类型。

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

#### Scenario: task.create 成功后来源条回显新创建的任务

- **WHEN** 用户在一个 `originTaskRef` 为 `undefined` 的会话中确认 `fyllo-action task.create`
- **AND** `lineage:createSessionTask` 成功创建任务 `local:task-new`
- **AND** 主进程已将对应 session meta 的 `originTaskRef` 更新为 `"local:task-new"`
- **THEN** ChatContainer 顶部 `OriginTaskBanner` 展示该新任务
- **AND** 来源标识为 `local`
- **AND** 标题取自 lineage subject 快照

#### Scenario: 再次创建任务时来源条展示最新绑定

- **WHEN** 某会话的 `originTaskRef` 已为 `"local:task-old"`
- **AND** 用户再次确认 `fyllo-action task.create` 并成功创建 `local:task-new`
- **AND** 主进程已将 `originTaskRef` 更新为 `"local:task-new"`
- **THEN** `OriginTaskBanner` 从展示 `"local:task-old"` 切换为展示 `"local:task-new"`

## UNCHANGED Requirements

### Requirement: session store 懒加载并缓存关联任务信息

系统 SHALL 在 session store 维护内存缓存 `taskInfoBySessionId`，存储每个 session 解析后的关联任务展示信息（来源 + 标题）。`selectSession` 时若目标 session 的 `originTaskRef` 非空且该 sessionId 未在缓存中，系统 SHALL 调用 `lineage:getByTask` 获取 subject 快照、解析出展示信息并写入缓存。已缓存的 session 再次切换 SHALL NOT 重复发起 `lineage:getByTask`。

该缓存 SHALL 复刻 session messages 的懒加载缓存模式（参照 `selectSession` 对 `loadedSessionIds` 的处理），为内存态、不持久化。

当 `originTaskRef` 在会话运行期间被更新（例如通过 `fyllo-action task.create`）时，session store SHALL 使该 sessionId 在 `taskInfoBySessionId` 中的缓存失效或更新，以确保 `OriginTaskBanner` 能回显最新绑定任务。

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

#### Scenario: originTaskRef 更新后缓存刷新

- **WHEN** 某会话运行期间 `originTaskRef` 从 `undefined` 更新为 `"local:task-new"`
- **THEN** session store 使该 sessionId 的 `taskInfoBySessionId` 缓存失效
- **AND** `OriginTaskBanner` 重新调用 `lineage:getByTask` 获取新任务快照并展示

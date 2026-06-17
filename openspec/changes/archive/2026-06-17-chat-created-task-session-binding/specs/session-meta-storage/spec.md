## MODIFIED Requirements

### Requirement: SessionMeta 持久化会话出身任务引用

`SessionMeta`（`src/main/infra/storage/session-store.ts` 导出）SHALL 包含可选字段 `originTaskRef?: LineageTaskRef`，记录当前会话绑定的任务引用（形如 `<source>:<id>`）。落盘 key 名 SHALL 为驼峰 `originTaskRef`，遵循 FylloCode 持久化字段命名规范；内存层（`Session.originTaskRef`）同样为驼峰 `originTaskRef`。

`originTaskRef` 的语义从「会话发起讨论时所针对的任务」扩展为「当前会话绑定的任务」。该字段 SHALL 不再是 write-once，但仍为**受控写入字段**：只允许以下两个入口写入或更新：

1. `chat-service.createSession`：在构造并落盘 session meta 时，根据入参 `taskRef` 初始化 `originTaskRef`。
2. `lineage-service.createSessionTask`：在通过 `fyllo-action task.create` 成功创建任务后，调用 `session-store.ts` 提供的专用函数 `updateSessionOriginTaskRef` 更新 `originTaskRef`。

系统 SHALL NOT 通过通用字段级 patch 接口（`patchSessionMeta` / `upsertSessionMeta`）修改 `originTaskRef`。为从类型层面钉死该约束，`SessionMetaPatch` 的 `Omit` 列表 SHALL 继续包含 `originTaskRef`（与 `sessionId`、`createdAt`、`tokenUsage` 并列），使通用 patch 接口在编译期即禁止修改 `originTaskRef`。

`session-store.ts` SHALL 导出专用函数 `updateSessionOriginTaskRef(projectPath: string, sessionId: string, originTaskRef: LineageTaskRef): Promise<SessionMeta | null>`，用于在受控入口中写入或更新 `originTaskRef`。该函数 SHALL 同时更新 `updatedAt`，并保留 session meta 中所有其他字段。

`chat-service#toSession` SHALL 把 `meta.originTaskRef` 映射到 `Session.originTaskRef`，使 `chat:listSessions` 与 `chat:createSession` 等返回值一致地暴露该字段；未持久化时为 `undefined`。

会话未关联任务时 `originTaskRef` SHALL 为 `undefined`，且该 session meta SHALL 可被正常持久化与读取。

#### Scenario: createSession 携带 taskRef 时初始化 originTaskRef

- **WHEN** `chat-service.createSession` 收到的入参含非空 `taskRef`
- **THEN** 构造的 session meta 含 `originTaskRef` 字段（驼峰 key），值等于入参 `taskRef`
- **AND** 与 meta 一次原子落盘

#### Scenario: 未携带 taskRef 时不写入该字段

- **WHEN** `chat-service.createSession` 收到的入参无 `taskRef`
- **THEN** 落盘的 session meta 不含 `originTaskRef`（或为 `undefined`）
- **AND** session meta 正常持久化

#### Scenario: 通用字段级 patch 无法修改 originTaskRef

- **WHEN** 某 session 已持久化 `originTaskRef`
- **AND** 调用方尝试通过 `patchSessionMeta` 或 `upsertSessionMeta` 传入 `{ originTaskRef: "local:task-2" }`
- **THEN** TypeScript 编译期报错，调用无法通过
- **AND** session meta 中的 `originTaskRef` 保持不变

#### Scenario: createSessionTask 成功后更新 originTaskRef

- **WHEN** `lineage-service.createSessionTask` 成功创建任务 `local:task-new`
- **THEN** 调用 `updateSessionOriginTaskRef(projectPath, sessionId, "local:task-new")`
- **AND** 对应 session meta 的 `originTaskRef` 被更新为 `"local:task-new"`
- **AND** `updatedAt` 被更新
- **AND** session meta 中其他字段保持不变

#### Scenario: 新绑定覆盖旧绑定

- **WHEN** 某 session 的 `originTaskRef` 已为 `"local:task-old"`
- **AND** 再次通过 `createSessionTask` 成功创建任务 `local:task-new`
- **THEN** `updateSessionOriginTaskRef` 将 `originTaskRef` 覆盖为 `"local:task-new"`
- **AND** 旧的 `"local:task-old"` 不再作为当前绑定任务

#### Scenario: listSessions 返回包含 originTaskRef

- **WHEN** renderer 调用 `chat:listSessions`
- **THEN** main 在 `toSession(meta, projectId)` 内把 `meta.originTaskRef` 映射为 `Session.originTaskRef`（未持久化时为 `undefined`）

### Requirement: createSession 的 sessionId 支持 probe 起源沿用与非 probe 起源新建双来源

`chat-service.createSession`（`src/main/services/chat/chat-service.ts`）的入参 SHALL 新增可选字段 `fylloSessionId?: string`。`createSession` 构造 `SessionMeta` 时的 `sessionId` 取值 SHALL 遵循：

- 当入参 `fylloSessionId` 为非空字符串时（probe 起源：该 id 已在 probe 阶段生成并注入过 MCP env），`meta.sessionId` SHALL 沿用该值，SHALL NOT 再调用 `newSessionId()`。
- 当入参未提供 `fylloSessionId` 时（非 probe 起源），`meta.sessionId` SHALL 由 `newSessionId()`（`src/main/infra/ids`）生成，与现状一致。

入参 schema（`src/shared/schemas/ipc/chat.ts` 的 `createSessionInputSchema`）SHALL 以 `.optional()` 标注 `fylloSessionId`；preload `chatApi.createSession`（`src/preload/api/chat.ts`）入参类型同步扩展。

该 sessionId 来源变化 SHALL NOT 影响 `originTaskRef` 的初始化逻辑：`originTaskRef` 仍在构造 meta 时由 `createSession` 根据入参 `taskRef` 写入，与 sessionId 来源无关。`fylloSessionId` 入参与 `taskRef` 入参 SHALL 可在同一次 `createSession` 调用中并存（对应 probe 起源会话同时从任务页发起讨论的场景）。

`originTaskRef` 在 `createSession` 之后允许被 `lineage-service.createSessionTask` 通过 `updateSessionOriginTaskRef` 更新，但 SHALL NOT 通过通用字段级 patch 接口修改。

`fylloSessionId` 仅决定 `meta.sessionId` 取值，SHALL NOT 作为额外字段持久化进 session meta（sessionId 本身即权威记录）。

#### Scenario: probe 起源沿用传入的 fylloSessionId

- **WHEN** `createSession` 入参含 `fylloSessionId: "sess-P"`
- **THEN** 落盘的 `meta.sessionId === "sess-P"`
- **AND** 不调用 `newSessionId()`

#### Scenario: 非 probe 起源生成新 sessionId

- **WHEN** `createSession` 入参不含 `fylloSessionId`
- **THEN** `meta.sessionId` 由 `newSessionId()` 生成
- **AND** 行为与本次变更之前一致

#### Scenario: probe 起源与 taskRef 在同一调用并存

- **WHEN** `createSession` 入参同时含 `fylloSessionId: "sess-P"` 与 `taskRef: "yunxiao:STORY-1"`
- **THEN** `meta.sessionId === "sess-P"`
- **AND** `meta.originTaskRef === "yunxiao:STORY-1"`（初始化写入）
- **AND** 两字段互不干扰

#### Scenario: fylloSessionId 不作为独立字段持久化

- **WHEN** `createSession` 入参含 `fylloSessionId: "sess-P"`
- **THEN** 落盘 session meta JSON 中 `sessionId` 为 `"sess-P"`
- **AND** 不存在名为 `fylloSessionId` 的额外持久化字段

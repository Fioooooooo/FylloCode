## ADDED Requirements

### Requirement: createSession 的 sessionId 支持 probe 起源沿用与非 probe 起源新建双来源

`chat-service.createSession`（`src/main/services/chat/chat-service.ts`）的入参 SHALL 新增可选字段 `fylloSessionId?: string`。`createSession` 构造 `SessionMeta` 时的 `sessionId` 取值 SHALL 遵循：

- 当入参 `fylloSessionId` 为非空字符串时（probe 起源：该 id 已在 probe 阶段生成并注入过 MCP env），`meta.sessionId` SHALL 沿用该值，SHALL NOT 再调用 `newSessionId()`。
- 当入参未提供 `fylloSessionId` 时（非 probe 起源），`meta.sessionId` SHALL 由 `newSessionId()`（`src/main/infra/ids`）生成，与现状一致。

入参 schema（`src/shared/schemas/ipc/chat.ts` 的 `createSessionInputSchema`）SHALL 以 `.optional()` 标注 `fylloSessionId`；preload `chatApi.createSession`（`src/preload/api/chat.ts`）入参类型同步扩展。

该 sessionId 来源变化 SHALL NOT 影响 `originTaskRef` 的 write-once 约束（见「SessionMeta 持久化会话出身任务引用」Requirement）：`originTaskRef` 仍在构造 meta 时由 `createSession` 一次写入，与 sessionId 来源无关。`fylloSessionId` 入参与 `taskRef` 入参 SHALL 可在同一次 `createSession` 调用中并存（对应 probe 起源会话同时从任务页发起讨论的场景）。

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
- **AND** `meta.originTaskRef === "yunxiao:STORY-1"`（write-once 一次写入）
- **AND** 两字段互不干扰

#### Scenario: fylloSessionId 不作为独立字段持久化

- **WHEN** `createSession` 入参含 `fylloSessionId: "sess-P"`
- **THEN** 落盘 session meta JSON 中 `sessionId` 为 `"sess-P"`
- **AND** 不存在名为 `fylloSessionId` 的额外持久化字段

## ADDED Requirements

### Requirement: SessionMeta 持久化会话出身任务引用

`SessionMeta`（`src/main/infra/storage/session-store.ts` 导出）SHALL 包含可选字段 `originTaskRef?: LineageTaskRef`，记录该会话发起讨论时所针对的任务引用（形如 `<source>:<id>`）。落盘 key 名 SHALL 为驼峰 `originTaskRef`，遵循 FylloCode 持久化字段命名规范（见 `persist-field-naming-conventions` spec）；内存层（`Session.originTaskRef`）同样为驼峰 `originTaskRef`。

`originTaskRef` SHALL 为 write-once 字段：唯一写入者 SHALL 为 `chat-service.createSession`，在构造并落盘 session meta 时一次写入。系统 SHALL NOT 在创建之后的任何路径改写或清除该字段。为从类型层面钉死该约束，`SessionMetaPatch` 的 `Omit` 列表 SHALL 包含 `originTaskRef`（与 `sessionId`、`createdAt`、`tokenUsage` 并列），使字段级 patch 接口在编译期即禁止修改 `originTaskRef`。

`chat-service#toSession` SHALL 把 `meta.originTaskRef` 映射到 `Session.originTaskRef`，使 `chat:listSessions` 与 `chat:createSession` 等返回值一致地暴露该字段；未持久化时为 `undefined`。

会话未关联任务时 `originTaskRef` SHALL 为 `undefined`，且该 session meta SHALL 可被正常持久化与读取。

#### Scenario: createSession 携带 taskRef 时写入 originTaskRef

- **WHEN** `chat-service.createSession` 收到的入参含非空 `taskRef`
- **THEN** 构造的 session meta 含 `originTaskRef` 字段（驼峰 key），值等于入参 `taskRef`
- **AND** 与 meta 一次原子落盘

#### Scenario: 未携带 taskRef 时不写入该字段

- **WHEN** `chat-service.createSession` 收到的入参无 `taskRef`
- **THEN** 落盘的 session meta 不含 `originTaskRef`（或为 `undefined`）
- **AND** session meta 正常持久化

#### Scenario: 后续字段级更新不改写 originTaskRef

- **WHEN** 某 session 已持久化 `originTaskRef`
- **AND** 后续一次字段级 patch 写入 `acpSessionId`、`turnCount`、`title` 或 `configOptions`
- **THEN** 写回后的 session meta 仍保留原有 `originTaskRef` 不变
- **AND** `SessionMetaPatch` 类型不允许把 `originTaskRef` 作为 patch 字段传入

#### Scenario: listSessions 返回包含 originTaskRef

- **WHEN** renderer 调用 `chat:listSessions`
- **THEN** main 在 `toSession(meta, projectId)` 内把 `meta.originTaskRef` 映射为 `Session.originTaskRef`（未持久化时为 `undefined`）

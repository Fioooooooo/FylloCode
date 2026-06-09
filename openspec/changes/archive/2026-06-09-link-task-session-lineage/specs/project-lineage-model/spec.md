## ADDED Requirements

### Requirement: linkTaskSession 便利写入 API

系统 SHALL 在 `services/lineage`（`src/main/services/lineage/lineage-service.ts`）暴露便利写入 API `linkTaskSession(projectPath, taskRef, sessionId)`，其内部 SHALL 组合现有的 `ensureTaskSubject`（以 taskRef 命中/新建 subject）与 `linkSession`（把 sessionId 关联到该 subject）两步，使调用方仅凭 `taskRef` 与 `sessionId` 即可一次完成"建/复用 task subject 并挂上 session 边"。

该 API SHALL 全程幂等：对同一 `(taskRef, sessionId)` 重复调用 SHALL NOT 产生重复 link 条目，Subject 状态保持一致；与第①步预先调用的 `ensureTaskSubject` 重复 ensure 同一 ref SHALL 无副作用（复用既有 subject）。

`linkTaskSession` 内部调用 `ensureTaskSubject` 时，若调用方未提供完整快照而仅有 `taskRef`，系统 SHALL 复用既有 subject 的 task 快照（命中既有 subject 时不要求重新提供 snapshot）。本 API 的设计前提是：task subject 已由发起讨论的第①步 `ensureTaskSubject(携带完整 LineageTaskSnapshot)` 创建，`linkTaskSession` 在 createSession handler 阶段仅负责挂边。

#### Scenario: linkTaskSession 一次完成建/复用与挂边

- **WHEN** 对一个已由 `ensureTaskSubject` 创建 subject 的 `taskRef` 调用 `linkTaskSession(projectPath, taskRef, sessionId)`
- **THEN** 系统经 `index.tasks` 以 ref 命中既有 subjectId，复用该 Subject
- **AND** 在该 Subject 的 `links` 中追加 `sessionId` 对应的 `LineageSessionLink`
- **AND** 在 `index.sessions` 登记 `sessionId → subjectId`

#### Scenario: linkTaskSession 幂等

- **WHEN** 对同一 `(taskRef, sessionId)` 重复调用 `linkTaskSession`
- **THEN** 结果不产生重复 link 条目
- **AND** Subject 状态保持一致

#### Scenario: ensureTaskSubject 与 linkTaskSession 组合不冲突

- **WHEN** 先以完整快照调用 `ensureTaskSubject(taskRef)`，随后调用 `linkTaskSession(taskRef, sessionId)`
- **THEN** 两次操作命中同一 subjectId
- **AND** 该 subject 同时保有原始 task 快照与新挂的 session 边

## MODIFIED Requirements

### Requirement: lineage 服务向渲染进程暴露 IPC 契约

系统 SHALL 在 `src/main/ipc/lineage.ts` 注册 lineage 的 IPC handler，并在 `src/preload/api/lineage.ts` 与 `src/renderer/src/api/lineage.ts` 暴露对应的请求-响应 api。新增 channel SHALL 定义在 lineage 专属的 channel 常量中（与 `ChatChannels` 同模式），SHALL NOT 复用或污染 `ChatChannels`。所有 handler SHALL 复用 `ipc/_kit` 的 `wrapHandler` 与 `validate`，入参 SHALL 由 `src/shared/schemas/ipc/lineage.ts` 的 zod schema 校验。

本能力 SHALL 暴露以下 channel：

- `lineage:ensureTaskSubject`：入参 `{ projectId: string, snapshot: LineageTaskSnapshot }`，调用 `lineage-service.ensureTaskSubject`，返回创建/复用的 `Subject`。
- `lineage:linkTaskSession`：入参 `{ projectId: string, taskRef: LineageTaskRef, sessionId: string }`，调用 `lineage-service.linkTaskSession`（见 project-lineage-model delta），返回更新后的 `Subject` 或 `null`。
- `lineage:getByTask`：入参 `{ projectId: string, ref: LineageTaskRef }`，调用 `lineage-service.getByTask`，返回 `TaskDownstreamProjection | null`。
- `lineage:getBySession`：入参 `{ projectId: string, sessionId: string }`，调用 `lineage-service.getBySession`，返回 `SessionLineageProjection | null`。renderer 可使用该 channel 在进入 session 时恢复该 session 所属 lineage、任务快照与该 session 产出的 proposal 列表。

#### Scenario: ensureTaskSubject 经 IPC 建/复用 subject

- **WHEN** renderer 调用 `lineageApi.ensureTaskSubject(projectId, snapshot)`
- **THEN** 主进程 handler 校验入参后调用 `lineage-service.ensureTaskSubject(projectPath, snapshot)`
- **AND** 返回的 `Subject` 包含与 `snapshot.ref` 对应的 `task` 字段
- **AND** 对同一 `snapshot.ref` 重复调用返回同一个 subjectId（幂等）

#### Scenario: getByTask 经 IPC 读取 subject 快照

- **WHEN** renderer 调用 `lineageApi.getByTask(projectId, ref)`，且该 ref 已存在 subject
- **THEN** 返回 `TaskDownstreamProjection`，其 `task.snapshot` 为发起讨论时拍摄的全量 `TaskItem`
- **AND** 即使该 task 在第三方侧已关闭、本地不可见，仍能从快照读取来源与标题

#### Scenario: getByTask 对未知 ref 返回 null

- **WHEN** renderer 调用 `lineageApi.getByTask(projectId, ref)`，且该 ref 无对应 subject
- **THEN** 返回 `null`，不抛出异常

#### Scenario: getBySession 经 IPC 读取 session lineage

- **WHEN** renderer 调用 `lineageApi.getBySession(projectId, "session-1")`，且该 session 已存在 lineage subject
- **THEN** 主进程 handler 校验入参后调用 `lineage-service.getBySession(projectPath, "session-1")`
- **AND** 返回 `SessionLineageProjection`
- **AND** 返回值的 `session.proposals` SHALL 包含该 session 已记录的 proposal `changeId` 列表

#### Scenario: getBySession 对未知 session 返回 null

- **WHEN** renderer 调用 `lineageApi.getBySession(projectId, "missing-session")`
- **AND** lineage index 中不存在该 session
- **THEN** 返回 `null`，不抛出异常

### Requirement: lineage IPC 入参经 schema 校验且 projectId 解析为 projectPath

系统 SHALL 在 `src/shared/schemas/ipc/lineage.ts` 定义 `ensureTaskSubjectInputSchema`、`linkTaskSessionInputSchema`、`getByTaskInputSchema`、`getBySessionInputSchema`。每个 schema 的 `projectId` SHALL 为非空字符串；`taskRef` / `ref` SHALL 校验为形如 `<source>:<id>` 的字符串；`sessionId` SHALL 为非空字符串；`snapshot` SHALL 校验 `ref` / `snapshot` / `capturedAt` 三字段齐备。handler SHALL 通过 lineage 服务现有的 project 路径解析方式把 `projectId` 解析为 `projectPath` 后再调用服务函数。

#### Scenario: 非法入参被 schema 拒绝

- **WHEN** renderer 以缺失 `projectId`、缺失 `snapshot.ref` 或空 `sessionId` 的入参调用任一 lineage channel
- **THEN** handler 通过 `validate` 抛出校验错误，返回标准 IPC 错误响应
- **AND** 不调用任何 lineage 服务函数

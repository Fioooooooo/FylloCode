# lineage-ipc 规范

## Purpose

定义 lineage 服务向渲染进程暴露的 IPC 契约，包括 subject 建立/查询、任务会话绑定、会话中创建任务以及 schema 校验失败语义。
## Requirements
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

### Requirement: lineage 暴露 createSessionTask 协调 channel

系统 SHALL 在 lineage 专属 channel 常量中新增 `lineage:createSessionTask`，并按现有 lineage IPC 模式在 `src/main/ipc/lineage.ts` 注册 handler、在 `src/preload/api/lineage.ts` 与 `src/renderer/src/api/lineage.ts` 暴露请求-响应 api。handler SHALL 复用 `ipc/_kit` 的 `wrapHandler` 与 `validate`，入参 SHALL 由 `src/shared/schemas/ipc/lineage.ts` 新增的 `createSessionTaskInputSchema` 校验。

该 channel 用于"开放讨论"路径：在主进程内一次性完成「创建本地任务 + 把任务回绑到当前会话的 lineage subject」。

- 入参 SHALL 为 `{ projectId: string, sessionId: string, title: string, description?: string }`。`projectId` / `sessionId` / `title` SHALL 为非空字符串；`description` SHALL 为可选字符串。
- handler SHALL 把 `projectId` 解析为 `projectPath` 后调用 `lineage-service` 新增的协调函数 `createSessionTask(projectPath, { sessionId, title, description })`。
- 返回值 SHALL 为创建出的 `TaskItem`。

协调函数 SHALL 按以下顺序执行：

1. 调用 task-service 的本地任务创建逻辑创建任务，`description` 包装为 `{ format: "plain_text", content: description ?? "" }`，并写入 write-once 字段 `originSessionId = sessionId`（见 task-local delta）。
2. 任务创建成功后，回绑到会话 subject：先 `getBySession(sessionId)` 定位该会话的既有 subject，调用 `backfillTask(subjectId, snapshot)` 把任务快照挂上；若该会话尚无 subject，则先 `ensureChatSubject(sessionId)` 兜底建出 `origin: "chat"` 的 subject 再 backfill。
3. 回绑 SHALL NOT 改变既有 subject 的 `origin`（`backfillTask`→`attachTask` 仅设置 `task` 字段）。

依赖方向 SHALL 保持：协调函数位于 `lineage-service`，由其调用 task-service；task-service SHALL NOT import lineage 模块。

#### Scenario: 开放讨论中创建并绑定任务

- **WHEN** renderer 调用 `lineageApi.createSessionTask(projectId, { sessionId, title: "补齐错误处理", description: "整理异常分支" })`
- **THEN** handler 校验入参后调用 `lineage-service.createSessionTask`
- **AND** 创建出 `TaskItem`，其 `originSessionId` 等于入参 `sessionId`，`description` 为 `{ format: "plain_text", content: "整理异常分支" }`
- **AND** 该会话的 subject 的 `task` 字段被回填为新任务快照
- **AND** subject 的 `origin` 保持为 `"chat"`
- **AND** 返回创建出的 `TaskItem`

#### Scenario: 会话尚无 subject 时兜底创建后回绑

- **WHEN** 调用 `createSessionTask` 时 `getBySession(sessionId)` 返回 `null`
- **THEN** 协调函数调用 `ensureChatSubject(sessionId)` 建出 `origin: "chat"` 的 subject
- **AND** 再将新任务快照 backfill 到该 subject
- **AND** 返回创建出的 `TaskItem`

### Requirement: createSessionTask 的失败语义——建任务硬要求、回绑 best-effort

系统 SHALL 区分协调函数两阶段的失败处理：

- **创建任务失败**：SHALL 向上抛出错误，整个 `lineage:createSessionTask` 调用失败，SHALL NOT 留下任何任务记录。
- **回绑失败**（`getBySession` / `ensureChatSubject` / `backfillTask` 抛错）：SHALL 仅通过 `logger` 记录，SHALL NOT 阻断调用，SHALL 仍返回已创建的 `TaskItem`。

任务记录中的 `originSessionId` SHALL 在回绑失败时仍已落盘，使 task→session 边可由 `rebuildIndex` 在未来从任务侧反推重建。

#### Scenario: 创建任务失败时整体失败

- **WHEN** 协调函数中本地任务创建抛出错误
- **THEN** `lineage:createSessionTask` 返回标准 IPC 错误响应
- **AND** 不进行回绑
- **AND** 不留下任务记录

#### Scenario: 回绑失败不阻断任务创建

- **WHEN** 任务已成功创建
- **AND** 回绑阶段（`getBySession` / `backfillTask` 等）抛出异常
- **THEN** 协调函数通过 `logger` 记录失败
- **AND** 仍返回已创建的 `TaskItem`（其 `originSessionId` 已写入）
- **AND** 不向 renderer 上抛错误

### Requirement: createSessionTask 入参经 schema 校验

系统 SHALL 在 `src/shared/schemas/ipc/lineage.ts` 定义 `createSessionTaskInputSchema`，校验 `projectId`、`sessionId`、`title` 为非空字符串，`description` 为可选字符串。handler SHALL 通过 lineage 服务现有的 project 路径解析方式把 `projectId` 解析为 `projectPath` 后再调用服务函数。

#### Scenario: 非法入参被 schema 拒绝

- **WHEN** renderer 以缺失 `sessionId` 或空 `title` 的入参调用 `lineage:createSessionTask`
- **THEN** handler 通过 `validate` 抛出校验错误，返回标准 IPC 错误响应
- **AND** 不调用任何 lineage 或 task 服务函数

### Requirement: lineage 暴露 plan 读写与批准 channel

系统 SHALL 在 lineage 专属 channel 常量中新增以下 IPC channel，并按现有 lineage IPC 模式在 `src/main/ipc/lineage.ts` 注册 handler、在 `src/preload/api/lineage.ts` 与 `src/renderer/src/api/lineage.ts` 暴露请求-响应 api：

- `lineage:readPlan`
- `lineage:savePlanBody`
- `lineage:approvePlan`

所有 handler SHALL 复用 `ipc/_kit` 的 `wrapHandler` 与 `validate`。入参 SHALL 由 `src/shared/schemas/ipc/lineage.ts` 的 zod schema 校验。每个入参 SHALL 包含 `projectId: string`、`sessionId: string`、`slug: string`；`projectId`、`sessionId`、`slug` 均 SHALL 为非空字符串。

`slug` SHALL 匹配完整 plan slug 格式：`yyyy-MM-dd-<agent-slug>`，并 SHALL NOT 包含路径分隔符、`.`、`..` 或空白。主进程 SHALL 根据 `projectId -> projectPath`、`sessionId` 与 `slug` 推导 plan 文件路径，并将访问限制在 `sessions/<sessionId>/plans/` 目录内。

#### Scenario: readPlan 经 IPC 读取 plan

- **WHEN** renderer 调用 `lineageApi.readPlan(projectId, { sessionId: "sess-1", slug: "2026-06-29-plan-a" })`
- **THEN** 主进程 handler 校验入参后解析 projectPath
- **AND** 读取 `sessions/sess-1/plans/2026-06-29-plan-a.md`
- **AND** 返回解析后的 plan document

#### Scenario: 非法 slug 被 schema 拒绝

- **WHEN** renderer 以 `slug = "../secret"` 调用任一 plan IPC
- **THEN** handler 通过 `validate` 抛出校验错误，返回标准 IPC 错误响应
- **AND** 不读取或写入任何文件

### Requirement: readPlan 返回 plan document

`lineage:readPlan` SHALL 返回 `PlanDocument`：

```ts
type PlanDocument = {
  slug: string;
  goal: string;
  createdAt: string;
  status: "draft" | "approved";
  body: string;
};
```

`body` SHALL 为去除 frontmatter 后的 markdown 正文。若文件不存在、frontmatter 缺失必要字段、status 不是 `"draft"` 或 `"approved"`，handler SHALL 返回标准 IPC 错误响应。

#### Scenario: readPlan 拆分 frontmatter 与正文

- **WHEN** plan 文件包含合法 frontmatter 与 markdown 正文
- **THEN** `lineage:readPlan` 返回 frontmatter 字段
- **AND** `body` 只包含 markdown 正文，不包含 frontmatter 分隔线

#### Scenario: plan 文件不存在

- **WHEN** renderer 调用 `readPlan` 指向不存在的 slug
- **THEN** handler 返回标准 IPC 错误响应
- **AND** 不创建空 plan 文件

### Requirement: savePlanBody 只保存正文并保留 frontmatter

`lineage:savePlanBody` SHALL 接收 `{ projectId, sessionId, slug, body }`，其中 `body` 为 markdown 字符串。handler SHALL 读取现有 plan 文件，保留 frontmatter 中的 `slug`、`goal`、`createdAt`、`status`，只替换正文内容并写回同一文件。

`savePlanBody` SHALL NOT 允许 renderer 修改 frontmatter。若现有文件不是合法 plan document，handler SHALL 返回错误，避免覆盖损坏文件。

#### Scenario: 保存正文保留 approved 状态

- **WHEN** plan frontmatter 中 `status === "approved"`
- **AND** renderer 调用 `savePlanBody` 更新正文
- **THEN** 写回后的 frontmatter 仍为 `status: approved`
- **AND** 只有正文被替换

#### Scenario: 损坏 frontmatter 时拒绝保存

- **WHEN** plan 文件缺失合法 frontmatter
- **AND** renderer 调用 `savePlanBody`
- **THEN** handler 返回标准 IPC 错误响应
- **AND** 不覆盖原文件内容

### Requirement: approvePlan 幂等批准 plan

`lineage:approvePlan` SHALL 接收 `{ projectId, sessionId, slug }`。handler SHALL 读取现有 plan 文件，将 frontmatter `status` 更新为 `"approved"` 并保留其他 frontmatter 字段与正文。若 plan 已经是 `"approved"`，handler SHALL 保持幂等并返回当前 `PlanDocument`。

#### Scenario: draft plan 被批准

- **WHEN** plan frontmatter 中 `status === "draft"`
- **AND** renderer 调用 `approvePlan`
- **THEN** 写回后的 frontmatter 中 `status === "approved"`
- **AND** 返回的 `PlanDocument.status === "approved"`

#### Scenario: approved plan 重复批准

- **WHEN** plan frontmatter 中 `status === "approved"`
- **AND** renderer 再次调用 `approvePlan`
- **THEN** handler 不报错
- **AND** 返回的 `PlanDocument.status === "approved"`

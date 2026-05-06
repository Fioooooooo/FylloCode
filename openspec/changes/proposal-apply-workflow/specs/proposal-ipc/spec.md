## ADDED Requirements

### Requirement: Main 进程提供 proposal:apply IPC handler

主进程 SHALL 注册 `proposal:apply` handler，接收 `{ projectId, changeId, workflowId }`，执行 run 创建流程并返回 `{ runId, stages }`。

详细行为见 `proposal-apply-run` spec 的"Apply run 由 main 进程创建并持久化元数据"requirement。

#### Scenario: apply 成功

- **WHEN** renderer 调用 `proposal:apply`，传入合法的 `projectId`、`changeId`、`workflowId`
- **THEN** 返回 `{ ok: true, data: { runId: string, stages: WorkflowStage[] } }`

#### Scenario: workflow 不存在

- **WHEN** `workflowId` 对应的 workflow 找不到
- **THEN** 返回 `{ ok: false, error: { code: "WORKFLOW_NOT_FOUND", message: "..." } }`

### Requirement: Main 进程提供 proposal:stageStream IPC handler

主进程 SHALL 注册 `proposal:stageStream` handler，接收 `{ runId, stageIndex, projectId, changeId }`，通过 `MessageChannelMain` 建立流式通道，驱动 `AcpSession` 执行对应 stage。

详细行为见 `proposal-apply-run` spec 的"Stage 流式执行"和"Main 进程持久化 UIMessage"requirements。

#### Scenario: stageStream 发起成功

- **WHEN** renderer 调用 `proposal:stageStream`
- **THEN** main 进程通过 `event.sender.postMessage("proposal:stageStream:port", null, [port2])` 将 port 传给 renderer
- **AND** 等待 renderer 发送 `{ type: "ready" }` 后开始执行

#### Scenario: stageStream 取消

- **WHEN** renderer 调用 `proposal:stageStream:cancel`，传入 `{ runId }`
- **THEN** main 进程取消对应 `AcpSession`

### Requirement: Main 进程提供 proposal:loadRun IPC handler

主进程 SHALL 注册 `proposal:loadRun` handler，接收 `{ projectId, changeId }`，读取 `apply-runs/<changeId>/run.json`，返回 `ApplyRunMeta | null`。

#### Scenario: run.json 存在

- **WHEN** renderer 调用 `proposal:loadRun`，传入 `{ projectId, changeId }`
- **THEN** 返回 `{ ok: true, data: ApplyRunMeta }`

#### Scenario: run.json 不存在

- **WHEN** `apply-runs/<changeId>/run.json` 文件不存在
- **THEN** 返回 `{ ok: true, data: null }`

### Requirement: Main 进程提供 proposal:loadRunMessages IPC handler

主进程 SHALL 注册 `proposal:loadRunMessages` handler，接收 `{ projectId, changeId, stageIndex }`，读取 `apply-runs/<changeId>/stage-{stageIndex}.messages.jsonl`，返回 `UIMessage<MessageMeta>[]`。

#### Scenario: messages 文件存在

- **WHEN** renderer 调用 `proposal:loadRunMessages`，传入合法参数
- **THEN** 返回 `{ ok: true, data: UIMessage[] }`（可能为空数组）

#### Scenario: messages 文件不存在

- **WHEN** 对应 `stage-{N}.messages.jsonl` 不存在
- **THEN** 返回 `{ ok: true, data: [] }`

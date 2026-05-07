## MODIFIED Requirements

### Requirement: Main process provides proposal apply IPC handlers

主进程 SHALL 注册 `proposal:apply`、`proposal:stageStream`、`proposal:stageStream:cancel`、`proposal:loadRun`、`proposal:loadRunMessages` IPC handler。

#### Scenario: apply 成功

- **WHEN** 渲染进程调用 `proposal:apply`，传入合法的 `projectId`、`changeId`、`workflowId`
- **THEN** 返回 `{ ok: true, data: { runId: string, stages: WorkflowStage[] } }`

#### Scenario: workflow 不存在

- **WHEN** `workflowId` 对应的 workflow 找不到
- **THEN** 返回 `{ ok: false, error: { code: "WORKFLOW_NOT_FOUND", message: "..." } }`

#### Scenario: stageStream 发起成功

- **WHEN** 渲染进程调用 `proposal:stageStream`
- **THEN** main 进程通过 `event.sender.postMessage("proposal:stageStream:port", null, [port2])` 将 port 传给 renderer
- **AND** 等待 renderer 发送 `{ type: "ready" }` 后开始执行

#### Scenario: stageStream 取消

- **WHEN** 渲染进程调用 `proposal:stageStream:cancel`，传入 `{ runId }`
- **THEN** main 进程取消对应 `AcpSession`

#### Scenario: run.json 存在

- **WHEN** 渲染进程调用 `proposal:loadRun`，传入 `{ projectId, changeId }`
- **THEN** 返回 `{ ok: true, data: ApplyRunMeta }`

#### Scenario: run.json 不存在

- **WHEN** `apply-runs/<changeId>/run.json` 文件不存在
- **THEN** 返回 `{ ok: true, data: null }`

#### Scenario: messages 文件存在

- **WHEN** 渲染进程调用 `proposal:loadRunMessages`，传入合法参数
- **THEN** 返回 `{ ok: true, data: UIMessage[] }`（可能为空数组）

#### Scenario: messages 文件不存在

- **WHEN** 对应 `stage-{N}.messages.jsonl` 不存在
- **THEN** 返回 `{ ok: true, data: [] }`

### Requirement: Main process provides proposal archive IPC handlers

主进程 SHALL 注册 `proposal:archive`、`proposal:archive:cancel` IPC handler，并使用独立的 `proposal:archive:port` MessagePort 通道传输流式事件。

archive flow SHALL:

- 读取当前 proposal 对应的 apply run
- 复用最新已完成的 apply stage ACP session id
- 使用 `proposal-archive` stage type 构造 prompt
- 不依赖 workflow templates

#### Scenario: archive starts successfully

- **WHEN** 渲染进程调用 `proposal:archive`，传入 `{ projectId, changeId }`
- **THEN** main process 恢复已完成 apply stage 的 ACP session
- **AND** 通过 `proposal:archive:port` 将 MessagePort 传给 renderer
- **AND** 等待 renderer 发送 `{ type: "ready" }` 后开始归档流
- **AND** 返回 `{ ok: true, data: { runId: string, stage: WorkflowStage } }`

#### Scenario: no completed apply run

- **WHEN** 当前 proposal 没有可复用的 completed apply run
- **THEN** 返回错误，code 为 `APPLY_RUN_NOT_READY`

#### Scenario: archive 取消

- **WHEN** 渲染进程调用 `proposal:archive:cancel`，传入 `{ runId }`
- **THEN** main process 取消对应 `AcpSession`

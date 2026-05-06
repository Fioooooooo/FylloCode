# proposal-apply-run Specification

## Purpose

定义 Proposal Apply Run 的执行生命周期，包括 run 创建、stage 流式执行、main 进程消息持久化、renderer 实时展示，以及页面重新打开后的历史恢复。

## ADDED Requirements

### Requirement: Apply run 由 main 进程创建并持久化元数据

系统 SHALL 在收到 `proposal:apply` IPC 时，在 main 进程创建 `ApplyRunMeta`，持久化到 `data/projects/<encoded>/apply-runs/<changeId>/run.json`，并将 `.openspec.yaml` 的 `status` 字段更新为 `applying`。

`ApplyRunMeta` 结构：

- `runId`：格式 `run-{timestamp}`
- `changeId`：对应的 change 目录名
- `workflowId`：使用的 workflow id
- `stages`：workflow stages 快照（`WorkflowStage[]`）
- `currentStageIndex`：当前执行到第几个 stage（0-based，初始为 0）
- `stageAcpSessionIds`：`Record<number, string>`，stageIndex → acpSessionId
- `status`：`"running" | "done" | "error"`
- `startedAt` / `updatedAt`：ISO 8601 字符串

#### Scenario: 创建新 run

- **WHEN** renderer 调用 `proposal:apply`，传入 `{ projectId, changeId, workflowId }`
- **THEN** main 进程找到对应 `WorkflowTemplate`，生成 `runId`
- **AND** 将 `ApplyRunMeta` 写入 `apply-runs/<changeId>/run.json`（覆盖写，每个 changeId 只保留最新 run）
- **AND** 将项目 `openspec/changes/<changeId>/.openspec.yaml` 的 `status` 改为 `applying`
- **AND** 返回 `IpcResponse<{ runId: string; stages: WorkflowStage[] }>`

#### Scenario: workflowId 对应的 workflow 不存在

- **WHEN** `proposal:apply` 传入的 `workflowId` 在 `workflow:list` 结果中找不到
- **THEN** 返回 `IpcResponse` 错误，code 为 `WORKFLOW_NOT_FOUND`

### Requirement: Stage 流式执行通过 MessagePort 传输 chunk

系统 SHALL 在收到 `proposal:stageStream` IPC 时，main 进程根据 `stage.type` 构造 prompt，启动 `AcpSession`，通过 `MessageChannelMain` 将 `SessionEvent` chunk 推给 renderer。

prompt 构造规则（策略 Map，按 `stage.type` 分发）：

- `proposal-apply`：`加载 skill fyllo-apply-change，实现 {changeId}`
- 其他 type：抛出错误，code 为 `STAGE_TYPE_NOT_IMPLEMENTED`

`agentId` 取自 `stages[stageIndex].agent`；若为空，使用 workflow 默认 agent（当前硬编码为 `"claude-acp"`）。

#### Scenario: 发起 stage stream

- **WHEN** renderer 调用 `proposal:stageStream`，传入 `{ runId, stageIndex, projectId, changeId }`
- **THEN** main 进程通过策略 Map 构造 prompt
- **AND** 创建 `AcpSession`，通过 `MessageChannelMain` 将 port2 传给 renderer
- **AND** 等待 renderer 发送 `{ type: "ready" }` 后调用 `session.start(prompt)`
- **AND** 将 `acpSessionId` 记录到 `run.json` 的 `stageAcpSessionIds[stageIndex]`

#### Scenario: 不支持的 stage type

- **WHEN** `stages[stageIndex].type` 不在策略 Map 中
- **THEN** port 发送 `{ type: "error", data: { code: "STAGE_TYPE_NOT_IMPLEMENTED", message: "..." } }`

#### Scenario: 取消 stage stream

- **WHEN** renderer 调用 `proposal:stageStream:cancel`，传入 `{ runId }`
- **THEN** main 进程调用对应 `AcpSession.cancel()`
- **AND** 从活跃 session Map 中移除该 runId

### Requirement: Main 进程在 stage 完成时持久化 UIMessage

系统 SHALL 在 main 进程维护 `MessageAssembler`，将 `SessionEvent` 流组装为 `UIMessage<MessageMeta>`，在收到 `done` 事件时将完整消息写入 `apply-runs/<changeId>/stage-{N}.messages.jsonl`，格式与 `session-store` 的 `appendMessage` 完全一致。

持久化不依赖 renderer 存活：即使 renderer 在 stage 执行过程中关闭，main 进程仍会在 stage 完成时写入磁盘。

`MessageAssembler` 组装规则（与 `frontend/src/stores/chat.ts` 的 `streamSessionMessage` 逻辑一致）：

- `text_delta`：追加到当前 assistant message 的最后一个 text part；若无则新建 text part
- `tool_call_start`：在当前 assistant message 追加 `DynamicToolUIPart`，state 为 `"input-available"`
- `tool_call_update`（`in_progress`）：更新对应 `DynamicToolUIPart` 的 input/title
- `tool_call_update`（`completed` / `failed`）：将对应 part 的 state 改为 `"output-available"`，填入 output
- `done`：将当前 assistant message 写入磁盘，更新 `run.json` 的 `currentStageIndex` 和 `updatedAt`

#### Scenario: Stage 正常完成

- **WHEN** `AcpSession` emit `done` 事件
- **THEN** main 进程将 `MessageAssembler` 中的当前 assistant message 写入 `stage-{N}.messages.jsonl`
- **AND** 更新 `run.json` 的 `currentStageIndex`（+1）和 `updatedAt`
- **AND** 通过 port 发送 `{ type: "done", data: { totalTokens } }`

#### Scenario: Renderer 在 stage 执行中途关闭

- **WHEN** renderer 关闭，MessagePort 断开
- **THEN** main 进程的 `AcpSession` 继续运行
- **AND** `MessageAssembler` 继续组装消息
- **AND** stage 完成时正常写入磁盘

#### Scenario: Stage 执行出错

- **WHEN** `AcpSession` emit `error` 事件
- **THEN** main 进程更新 `run.json` 的 `status` 为 `"error"`
- **AND** 通过 port 发送 `{ type: "error", data: { code, message } }`（如果 port 仍活着）

### Requirement: 多 stage 由 renderer 串行驱动

系统 SHALL 由 renderer 在当前 stage `done` 后，自动发起下一个 `proposal:stageStream`，直到所有 stage 完成。

#### Scenario: 当前 stage 完成，还有下一个 stage

- **WHEN** renderer 收到 stage N 的 `done` 消息
- **THEN** renderer 自动发起 `proposal:stageStream`，`stageIndex` 为 N+1

#### Scenario: 最后一个 stage 完成

- **WHEN** renderer 收到最后一个 stage 的 `done` 消息
- **THEN** renderer 调用 `proposal:apply` 不再发起新 stream
- **AND** main 进程更新 `run.json` 的 `status` 为 `"done"`

### Requirement: 页面重新打开时自动恢复历史日志展示

系统 SHALL 在 `[id].vue` 的 `onMounted` 中检测 `proposal.status === "applying"`，自动调用 `resumeRun`，从磁盘读取 `run.json` 和 `stage-N.messages.jsonl`，在 SidePanel 展示历史日志。恢复后不自动续跑。

#### Scenario: 页面重新打开，proposal 处于 applying 状态

- **WHEN** 用户打开 proposal 详情页，`proposal.status === "applying"`
- **THEN** 自动调用 `resumeRun(projectId, changeId)`
- **AND** 读取 `run.json` 恢复 `runMeta`
- **AND** 读取 `stage-{currentStageIndex}.messages.jsonl` 恢复历史消息
- **AND** SidePanel 自动打开，展示历史日志
- **AND** 不自动触发新的 stream

#### Scenario: run.json 不存在（异常情况）

- **WHEN** `proposal.status === "applying"` 但 `run.json` 不存在
- **THEN** `resumeRun` 静默失败，不展示历史日志
- **AND** SidePanel 不自动打开

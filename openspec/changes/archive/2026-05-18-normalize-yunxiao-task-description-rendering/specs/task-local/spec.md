## MODIFIED Requirements

### Requirement: 本地任务使用 UnifiedTask schema

系统 SHALL 使用 `shared/types/task.ts` 中定义的 `UnifiedTask` schema 存储和传输本地任务。本地任务 SHALL 具有 `source: "local"`、`sourceMeta: { source: "local" }` 和一个本地生成的 `id`。本地任务的 `description` SHALL 为结构化对象 `{ format, content }`，且本地任务创建与更新后的 canonical 形式 SHALL 始终使用 `{ format: "plain_text", content: string }`，而不是裸字符串。

#### Scenario: 创建本地任务生成 UnifiedTask

- **WHEN** 用户创建一个标题为"Fix login bug"的新本地任务
- **THEN** 系统生成一个 `TaskItem`，具有 `source: "local"`、`status: "open"` 和 `sourceMeta: { source: "local" }`
- **AND** 该任务的 `description` 为 `{ format: "plain_text", content: "" }` 或用户输入的纯文本内容

### Requirement: 本地任务通过 IPC 支持 CRUD

系统 SHALL 暴露 IPC handler 用于任务操作：`task:list`（列出任务）、`task:create`（创建任务）、`task:update`（更新任务）和 `task:delete`（删除任务）。其中 `task:create` 和 `task:update` 的输入契约 SHALL 使用结构化 `description` 对象，而不是 `string`。渲染进程在创建或编辑本地任务时，虽然仍可使用 textarea 采集文本，但在调用 IPC 前 SHALL 将其包装为 `{ format: "plain_text", content }`。

#### Scenario: 列出当前项目的任务

- **WHEN** 渲染进程调用 `task:list` 并传入 `projectId`
- **THEN** 主进程返回该项目的所有 `TaskItem[]`
- **AND** 返回值中的每条任务都包含结构化 `description`

#### Scenario: 创建任务

- **WHEN** 渲染进程调用 `task:create` 并传入 `CreateLocalTaskInput` 和 `projectId`
- **THEN** 主进程创建一个新的 `TaskItem`，持久化它，并返回创建的任务
- **AND** 新任务的 `description.format` 为 `plain_text`

#### Scenario: 更新任务

- **WHEN** 渲染进程调用 `task:update` 并传入 `taskId`、部分更新内容和 `projectId`
- **THEN** 主进程更新匹配的任务并持久化变更
- **AND** 若更新 payload 包含 `description`，其 canonical 形式仍为 `{ format: "plain_text", content }`

#### Scenario: 删除任务

- **WHEN** 渲染进程调用 `task:delete` 并传入 `taskId` 和 `projectId`
- **THEN** 主进程移除该任务并持久化变更

### Requirement: 本地任务创建需要最小字段集

系统 SHALL 要求任务创建时必须提供 `title`。`description` SHALL 为可选，默认值为 `{ format: "plain_text", content: "" }`。`status` SHALL 默认为 `"open"`。本 requirement 不要求更改本地任务创建与编辑 UI 的控件形态；当前 textarea 仍可继续使用，但其提交结果 SHALL 进入结构化 `description` 契约。

#### Scenario: 仅用标题创建任务

- **WHEN** 用户仅使用标题创建任务
- **THEN** 任务以 `description: { format: "plain_text", content: "" }` 和 `status: "open"` 创建

#### Scenario: 拒绝无标题的任务

- **WHEN** 用户尝试创建一个没有标题的任务
- **THEN** 系统以验证错误拒绝创建

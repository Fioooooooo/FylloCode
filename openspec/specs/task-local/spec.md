# task-local Specification

## Purpose

定义本地任务的数据模型、存储机制、IPC 接口，以及主进程与渲染进程之间的任务管理契约。

## Requirements

### Requirement: 本地任务使用 UnifiedTask schema

系统 SHALL 使用 `src/shared/types/task.ts` 中定义的 `UnifiedTask` schema 存储和传输本地任务。本地任务 SHALL 具有 `source: "local"`、`sourceMeta: { source: "local" }` 和一个本地生成的 `id`。本地任务的 `description` SHALL 为结构化对象 `{ format, content }`，且本地任务创建与更新后的 canonical 形式 SHALL 始终使用 `{ format: "plain_text", content: string }`，而不是裸字符串。

`TaskItem` SHALL NOT 再包含 `proposalId` 字段。该字段从未被任何任务创建路径写入，为死字段，本 change 将其从 `TaskItem`、`CreateLocalTaskInput`、`UpdateTaskInput` 及对应 zod schema 中移除。

`TaskItem` SHALL 新增可选字段 `originSessionId?: string`，记录创建该任务的来源 chat 会话 id。该字段 SHALL 为 **write-once**：唯一写入路径为 `lineage:createSessionTask` 协调流程（见 lineage-ipc delta）；普通 `task:create` 与 `task:update` 路径 SHALL NOT 写入或改写它。`UpdateTaskInput`（task patch 类型）SHALL NOT 包含 `originSessionId`，使 `task-service.applyPatch` 在类型层无法触及该字段。

#### Scenario: 创建本地任务生成 UnifiedTask

- **WHEN** 用户创建一个标题为"Fix login bug"的新本地任务
- **THEN** 系统生成一个 `TaskItem`，具有 `source: "local"`、`status: "open"` 和 `sourceMeta: { source: "local" }`
- **AND** 该任务的 `description` 为 `{ format: "plain_text", content: "" }` 或用户输入的纯文本内容
- **AND** 生成的 `TaskItem` 不含 `proposalId` 字段

#### Scenario: 经普通 task:create 创建的任务不含 originSessionId

- **WHEN** 渲染进程经 `task:create`（非 `lineage:createSessionTask`）创建本地任务
- **THEN** 生成的 `TaskItem` 的 `originSessionId` 为 `undefined`

#### Scenario: task:update 不能写入或改写 originSessionId

- **WHEN** 渲染进程调用 `task:update` 并尝试携带 `originSessionId`
- **THEN** `UpdateTaskInput` schema 不接受该字段（类型层与校验层均无该字段）
- **AND** 既有任务的 `originSessionId` 不被任何 patch 改写

### Requirement: 本地任务按项目持久化

系统 SHALL 将本地任务存储在项目级文件中，路径为 `data/projects/<encodedProjectPath>/tasks/tasks.json`。文件 SHALL 包含一个带有 `tasks` 数组和 `version` 字段的 JSON 对象，用于 schema 迁移。

#### Scenario: 为项目 A 存储任务

- **WHEN** 为项目 A 保存任务
- **THEN** 任务被写入 `data/projects/<encodedProjectAPath>/tasks/tasks.json`

#### Scenario: 为项目 B 存储任务

- **WHEN** 为项目 B 保存任务
- **THEN** 任务被写入 `data/projects/<encodedProjectBPath>/tasks/tasks.json` 的独立文件
- **AND** 项目 A 的任务不受影响

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

### Requirement: 任务 ID 在项目范围内本地唯一

系统 SHALL 使用项目现有的 ID 生成策略（`ai` 包的 `generateId` 或类似方法）生成任务 ID。ID SHALL 在项目范围内唯一。

#### Scenario: 两个项目拥有不同的任务 ID 空间

- **WHEN** 项目 A 有一条 id 为 "task-1" 的任务
- **AND** 项目 B 有一条 id 为 "task-1" 的任务
- **THEN** 两条任务在各自的存储文件中独立共存

### Requirement: 本地任务存储安全处理并发访问

系统 SHALL 在每次写操作前读取任务文件，以防止并发修改导致的数据丢失。

#### Scenario: 快速连续的任务操作

- **WHEN** 两个任务操作快速连续发生
- **THEN** 第二个操作读取第一个操作写入后的状态
- **AND** 没有任务数据丢失

### Requirement: 本地任务存储在读取时规范化数据

系统 SHALL 在从存储读取时验证并规范化任务数据，为缺失的可选字段提供合理的默认值。读取 SHALL 向后兼容历史数据：旧任务文件中存在的 `proposalId` 字段 SHALL 被忽略而不报错；缺失 `originSessionId` 的任务 SHALL 将该字段规范化为 `undefined`。

#### Scenario: 读取缺失字段的遗留任务文件

- **WHEN** 系统读取一个缺失可选字段（如 `labels`、`assignee`）的任务文件
- **THEN** 缺失字段被填充为安全默认值（`labels: []`、`assignee: undefined`）
- **AND** 任务保持可用

#### Scenario: 读取含遗留 proposalId 的任务文件

- **WHEN** 系统读取一个仍含 `proposalId` 字段的历史任务文件
- **THEN** `proposalId` 被忽略，不写入规范化后的 `TaskItem`
- **AND** 任务保持可用，其余字段正常读取

### Requirement: 本地任务创建需要最小字段集

系统 SHALL 要求任务创建时必须提供 `title`。`description` SHALL 为可选，默认值为 `{ format: "plain_text", content: "" }`。`status` SHALL 默认为 `"open"`。本 requirement 不要求更改本地任务创建与编辑 UI 的控件形态；当前 textarea 仍可继续使用，但其提交结果 SHALL 进入结构化 `description` 契约。

#### Scenario: 仅用标题创建任务

- **WHEN** 用户仅使用标题创建任务
- **THEN** 任务以 `description: { format: "plain_text", content: "" }` 和 `status: "open"` 创建

#### Scenario: 拒绝无标题的任务

- **WHEN** 用户尝试创建一个没有标题的任务
- **THEN** 系统以验证错误拒绝创建

## MODIFIED Requirements

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

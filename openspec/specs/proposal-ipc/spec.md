# proposal-ipc 规范

## Purpose

定义 Proposal 页面所需的主进程 IPC 能力，包括从当前项目文件系统读取 proposal 元数据和按需读取 markdown 文件内容。

## Requirements

### Requirement: 主进程从文件系统读取 proposal 列表

主进程 SHALL 提供 IPC handler，接收 `projectId`，通过 `loadProject(projectId)` 从持久化存储获取项目路径（与 chat IPC 的 `resolveProjectPath` 模式一致），读取 `openspec/changes/` 目录，返回 proposal 元数据列表。

每个 proposal 元数据包含：id（目录名）、title（目录名格式化：archive 下去掉 `YYYY-MM-DD-` 前缀后转 title case，根目录下直接转 title case）、status（推断值）、why（Why 段落第一段）、totalTasks、doneTasks、hasDesign（design.md 是否存在）、date（yaml created 字段）。

遍历规则：

- `openspec/changes/` 根目录直接子目录 → 非归档 change，id 为目录名（如 `proposal-ui-page`）
- `openspec/changes/archive/` 子目录 → 归档 change，id 为带日期前缀的目录名（如 `2026-04-19-integrations-page`）

状态推断规则：

- `archive/` 子目录下 → `archived`
- 根目录下，读取 yaml `status` 字段；无该字段时默认 `draft`

#### Scenario: 列出 proposals

- **WHEN** 渲染进程调用 `proposal:list` IPC
- **THEN** 主进程返回当前 project 下所有 proposal 的元数据数组
- **AND** 数组按 `created` 字段倒序排列

#### Scenario: 不存在 openspec/changes 目录

- **WHEN** 当前 project 目录下不存在 `openspec/changes/`
- **THEN** 主进程返回空数组

### Requirement: 主进程读取 proposal markdown 文件内容

主进程 SHALL 提供 IPC handler，接收 `{ projectId, changeId, filename }`，通过 `loadProject(projectId)` 还原项目路径后，先在根目录 `openspec/changes/<changeId>/` 查找，不存在则在 `openspec/changes/archive/<changeId>/` 查找，读取对应文件内容。

#### Scenario: 读取已有 markdown 文件

- **WHEN** 渲染进程调用 `proposal:readFile` IPC，传入 change id 和文件名
- **THEN** 主进程返回该文件的文本内容

#### Scenario: 文件不存在

- **WHEN** 请求的文件不存在
- **THEN** 主进程返回 `null`

### Requirement: 主进程提供 proposal apply IPC handlers

主进程 SHALL 注册 `proposal:apply`、`proposal:stageStream`、`proposal:stageStream:cancel`、`proposal:loadRun`、`proposal:loadRunMessages` IPC handler。

对于 `proposal:loadRun` 和 `proposal:loadRunMessages`，renderer SHALL 继续传递当前详情页拿到的 `changeId`。主进程在读取 apply run 持久化文件前 SHALL 负责判断该 `changeId` 是否为 archived proposal id；若是，则按归档命名规则解析出原始 `changeId`，并用该值读取 `apply-runs/<originalChangeId>/` 下的 `run.json` 与 `stage-{N}.messages.jsonl`。

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
- **THEN** 主进程使用归一化后的 apply run 存储 key 读取 run 元数据
- **AND** 返回 `{ ok: true, data: ApplyRunMeta }`

#### Scenario: archived changeId 映射到原始 apply run

- **WHEN** 渲染进程调用 `proposal:loadRun` 或 `proposal:loadRunMessages`，传入带 `YYYY-MM-DD-` 前缀的 archived `changeId`
- **THEN** 主进程识别该 archived proposal id
- **AND** 使用去除归档日期前缀后的原始 `changeId` 读取 `apply-runs/<originalChangeId>/` 下的历史 run 文件

#### Scenario: run.json 不存在

- **WHEN** 归一化后的 `apply-runs/<changeId>/run.json` 文件不存在
- **THEN** 返回 `{ ok: true, data: null }`

#### Scenario: messages 文件存在

- **WHEN** 渲染进程调用 `proposal:loadRunMessages`，传入合法参数
- **THEN** 主进程使用归一化后的 apply run 存储 key 读取消息文件
- **AND** 返回 `{ ok: true, data: UIMessage[] }`（可能为空数组）

#### Scenario: messages 文件不存在

- **WHEN** 归一化后的对应 `stage-{N}.messages.jsonl` 不存在
- **THEN** 返回 `{ ok: true, data: [] }`

### Requirement: 主进程提供 proposal archive IPC handlers

主进程 SHALL 注册 `proposal:archive`、`proposal:archive:cancel` IPC handler，并使用独立的 `proposal:archive:port` MessagePort 通道传输流式事件。

archive 流程 SHALL：

- 读取当前 proposal 对应的 apply run
- 复用最新已完成的 apply stage ACP session id
- 使用 `proposal-archive` stage type 构造 prompt
- 不依赖 workflow templates

#### Scenario: archive 成功启动

- **WHEN** 渲染进程调用 `proposal:archive`，传入 `{ projectId, changeId }`
- **THEN** main 进程恢复已完成 apply stage 的 ACP session
- **AND** 通过 `proposal:archive:port` 将 MessagePort 传给 renderer
- **AND** 等待 renderer 发送 `{ type: "ready" }` 后开始归档流
- **AND** 返回 `{ ok: true, data: { runId: string, stage: WorkflowStage } }`

#### Scenario: 没有已完成 apply run

- **WHEN** 当前 proposal 没有可复用的 completed apply run
- **THEN** 返回错误，code 为 `APPLY_RUN_NOT_READY`

#### Scenario: archive 取消

- **WHEN** 渲染进程调用 `proposal:archive:cancel`，传入 `{ runId }`
- **THEN** main process 取消对应 `AcpSession`

### Requirement: 从 proposal.md 提取 Why 文本

主进程 SHALL 解析 `proposal.md`，提取 `## Why` 标题下第一段非空文本作为 why 摘要。

#### Scenario: Why section 存在

- **WHEN** proposal.md 包含 `## Why` 段落
- **THEN** 返回该段落下第一段文本

#### Scenario: Why section 缺失或为空

- **WHEN** proposal.md 不包含 `## Why` 或段落为空
- **THEN** why 字段返回空字符串

### Requirement: 从 tasks.md 解析任务数量

主进程 SHALL 解析 `tasks.md`，统计 `- [x]` 和 `- [ ]` 数量，分别作为 doneTasks 和 totalTasks。

#### Scenario: 解析任务数量

- **WHEN** tasks.md 包含任务列表
- **THEN** doneTasks 为已勾选数量，totalTasks 为总数量

#### Scenario: tasks.md 缺失

- **WHEN** tasks.md 不存在
- **THEN** doneTasks 和 totalTasks 均返回 0

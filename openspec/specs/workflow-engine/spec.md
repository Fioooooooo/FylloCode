# workflow-engine Specification

## Purpose

定义 FylloCode Phase 1 的唯一通用 Workflow Engine：以 Workspace-owned 的 v2 YAML 为 definition，使用主进程 Run 状态机执行 fresh Agent、exec Action 和 human Gate，并在并发、持久化、恢复和生命周期边界内保持可观察、可取消的运行状态。

## Requirements

### Requirement: Workflow definition uses v2 schema and a separate Phase 1 execution profile

系统 SHALL 使用 `references/designs/workflow-engine/definition-schema.md` 将手写 YAML 解析为 `WorkflowDefinition`。definition SHALL 使用 version `2`、顶层 `name`、合法 stage id/引用和 schema 约束。定义态合法但超出 Phase 1 execution profile 的 workflow MAY 被保存，但 `trigger_workflow` SHALL 在创建 Run 前执行 capability preflight 并结构化拒绝。

Phase 1 SHALL 支持空 `requires`、`run.*` 模板引用、`AgentStage(context: fresh, produces: freeform)`、`ActionStage(op.type: exec)`、`Gate(type: human)`、合法 Transition 和 `maxLoops`。`context: inherit`、`WaitStage`、`gate.type: expr/verdict`、结构化 artifact/op、`retry` 和 `idempotencyKey` SHALL 返回 `WORKFLOW_CONTEXT_UNSUPPORTED` 或 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，且 SHALL NOT 创建 Run。

#### Scenario: 可执行 definition 被保存并可触发

- **WHEN** 用户提交包含 Agent fresh/freeform、Action exec、human Gate 和合法 Transition 的 v2 YAML
- **THEN** 系统 SHALL 保存完整 definition
- **AND** 后续 `trigger_workflow` SHALL 允许进入 Run 创建流程

#### Scenario: 定义态合法但超出 Phase 1 的 definition 被拒绝执行

- **WHEN** 用户保存包含 `context: inherit`、Wait、结构化 artifact 或其他未实现 capability 的合法 v2 YAML
- **THEN** 保存 SHALL 成功
- **AND** `trigger_workflow` SHALL 返回带 stage/feature refs 的结构化拒绝
- **AND** 系统 SHALL NOT 创建 Run、ACP session 或 Action process

#### Scenario: 无效 YAML 或 schema 不会覆盖合法 definition

- **WHEN** YAML 无法解析、缺少必填字段、stage id 重复或 transition 引用不存在的 stage
- **THEN** 保存 SHALL 返回具体 validation error
- **AND** 系统 SHALL NOT 静默修正或覆盖上一份合法 definition

### Requirement: Workflow definitions are Workspace-owned and use stable random identity

系统 SHALL 将 definition 存储在 `workspaceDataDir(workspaceId)/workflows/<workflow-id>/definition.yaml`。新建 workflow SHALL 分配随机 `workflowId`，且 ID SHALL 与 YAML 的 `name` 解耦。更新、重命名和删除 SHALL 按 workflowId 定位；重命名 SHALL NOT 移动 workflow 目录或改变既有 Run 路径。

#### Scenario: 新建 definition 获得稳定 ID

- **WHEN** `/workflow` 页面第一次保存 definition
- **THEN** Main SHALL 返回唯一 workflowId
- **AND** definition SHALL 写入以该 ID 命名的目录
- **AND** name SHALL 只作为内容和展示字段

#### Scenario: 重命名保留 Run 历史路径

- **WHEN** 用户使用同一 workflowId 保存修改 name 后的 YAML
- **THEN** 系统 SHALL 更新同一 `definition.yaml`
- **AND** SHALL 保留 workflowId、runs 目录和已有 snapshot 路径
- **AND** SHALL NOT 按新 name 创建第二份 workflow

#### Scenario: Workspace ownership isolates shared Folder data

- **WHEN** 两个 Workspace 引用同一 Folder 并各自保存或触发 workflow
- **THEN** 两者 SHALL 只读取各自 workspaceId 目录
- **AND** SHALL NOT 继承、合并或覆盖另一个 Workspace 的 definition/run 数据

### Requirement: Workflow runtime has no built-in template or global staging source

Phase 1 SHALL NOT ship、discover 或 initialize built-in workflow template。definition discovery SHALL 只读取当前 Workspace 的 `workflows/<workflow-id>/definition.yaml`，不得读取 packaged `resources/workflows/built-in/**`、全局 `data/workflows`/`userData/workflows`，也不得在这些位置之间复制文件。definition API SHALL NOT 暴露 built-in/custom source、built-in read-only protection、copy-on-save 或 built-in-specific delete error。旧全局文件 MAY 留在磁盘上，但 SHALL 保持 inert，不得迁移、自动删除或用于创建 Run。

#### Scenario: 构建和启动不包含 built-in workflow

- **WHEN** 应用构建并启动 definition service
- **THEN** package SHALL 不包含 `resources/workflows/built-in/**`
- **AND** startup SHALL 不初始化或复制全局 workflow 文件
- **AND** list/trigger/reconcile SHALL 只使用当前 Workspace definition

#### Scenario: 所有 Workspace definition 共享同一编辑契约

- **WHEN** definition service 返回 Workspace workflow
- **THEN** renderer 和 Main SHALL 以普通 Workspace definition 处理
- **AND** save/delete SHALL 使用 workflowId
- **AND** SHALL NOT 提供 built-in-only copy、read-only 或 delete-rejection 分支

#### Scenario: Legacy global staging remains inert

- **WHEN** `data/workflows` 或 `userData/workflows` 中仍有旧文件
- **THEN** v2 list、trigger 和 startup reconcile SHALL 忽略它们
- **AND** SHALL NOT 迁移、删除或执行这些文件

### Requirement: Run creation uses trusted ownership, atomic snapshots and one active Run per parent

Workflow Run SHALL 归属于 `{workspaceId,parentSessionId}`，同一复合 key 在 active 状态下最多存在一个 Run。`trigger_workflow` input SHALL 只提供 workflowId；parentSessionId SHALL 来自 Main 信任的 bundled MCP caller/Workspace context，不得接受 Agent 自报值。

创建 Run 前 SHALL 读取 definition、完成 schema/capability preflight，组装完整 `WorkflowRunSnapshot` 并原子写入 `<run-id>/<run-id>.json`。创建成功前 SHALL NOT 返回 runId。snapshot SHALL 包含 `snapshotSchemaVersion: 1`、完整 inline `frozenDefinition`、currentStageId、visitCounts、artifacts 和 status，不得只存 workflowVersion/hash 或 live definition 引用。

#### Scenario: 普通 trigger 创建并持久化 Run

- **WHEN** trusted chat caller 为没有 active Run 的 parent 触发可执行 workflow 且 confirmStart 为 false
- **THEN** 系统 SHALL 原子写入完整 snapshot
- **AND** Run SHALL 进入 running 并开始推进第一个 stage
- **AND** 返回 runId SHALL 对应已落盘 snapshot

#### Scenario: start confirmation 创建 awaiting snapshot

- **WHEN** workflow 的 confirmStart 为 true
- **THEN** 系统 SHALL 创建并落盘 `awaiting_start_confirmation` snapshot
- **AND** SHALL 发出 Workflow Run wake
- **AND** trigger SHALL 立即返回 runId/status 而不等待决策

#### Scenario: active parent conflict

- **WHEN** 同一 `{workspaceId,parentSessionId}` 已有 active Run 且再次 trigger 任意 workflow
- **THEN** 系统 SHALL 返回 `WORKFLOW_RUN_CONFLICT`
- **AND** SHALL NOT 创建第二个 Run、覆盖 snapshot 或启动新 stage

#### Scenario: snapshot atomic write failure

- **WHEN** definition 已通过解析/preflight 但 snapshot 写入失败
- **THEN** trigger SHALL 返回持久化错误
- **AND** SHALL NOT 返回未完整写入的 runId
- **AND** SHALL NOT 启动 ACP session 或 Action process

### Requirement: Run transitions are serialized and follow Transition/maxLoops semantics

WorkflowEngine SHALL 通过等价于 `advance(snapshot,event): snapshot` 的纯状态迁移推进 Run。ACP 完成、Action 完成、人工决策、取消和错误事件 SHALL 进入同一 per-Run serialized queue；每次有效推进 SHALL 在下一事件可见前原子持久化完整 snapshot。

系统 SHALL 按 `next.pass`、`next.fail`、`next.signal` 和 `maxLoops` 计算 stage 转移。达到终点进入 `succeeded`；失败、循环超限和未处理执行错误进入 `failed`，并保留 stage/error 上下文。开始确认和 Action 确认被拒绝时进入 `cancelled`，不改写为普通 stage fail 分支。

#### Scenario: Action pass/fail follows definition

- **WHEN** exec Action 以退出码 0 完成
- **THEN** engine SHALL 沿 pass transition 推进
- **WHEN** Action 以非零退出码、启动失败或 signal 终止
- **THEN** engine SHALL 沿 fail transition 推进或进入 failed

#### Scenario: maxLoops prevents an infinite back edge

- **WHEN** stage 访问次数超过定义的 maxLoops
- **THEN** Run SHALL 进入 failed
- **AND** snapshot SHALL 保留 currentStageId、visitCounts 和诊断错误
- **AND** engine SHALL NOT 执行回边后的 stage

#### Scenario: Human Gate waits for a decision

- **WHEN** Agent stage 完成并命中 human Gate
- **THEN** Run SHALL 先持久化为 `awaiting_gate_decision`
- **AND** SHALL NOT 自动选择 pass/fail
- **AND** approve/reject SHALL 分别走 pass/fail transition

### Requirement: Fresh Agent and exec Action use workflow-owned execution resources

`AgentStage(context: fresh)` SHALL 使用独立 workflow session owner、registry/store 和 Run transcript；不得调用 `SpawnedSessionManager.promptToAgent`，不得写入 spawned-session store、notification outbox、list 或 count。逻辑 workflow session ID SHALL 在 stage 启动前写入 snapshot，ACP session ID 可在连接解析后补写；最终响应文本 SHALL 作为 freeform artifact 保存。

`ActionStage(op.type: exec)` SHALL 只执行 definition command 和可选 cwd。cwd 缺省使用 parent session 冻结 Workspace snapshot 的 primary Folder，显式 cwd SHALL 通过同一 snapshot 校验。stdout/stderr SHALL 写入 Run 下 `action-outputs/<stage-id>.log`，snapshot SHALL 保存相对日志路径、退出码或 signal 以及起止时间。Phase 1 SHALL NOT 增加隐含 workflow timeout。

#### Scenario: Fresh Agent is visible without spawned ownership

- **WHEN** Run 推进到 Agent fresh stage
- **THEN** 系统 SHALL 创建 workflow-owned fresh session 并记录逻辑 session ID
- **AND** transcript SHALL 位于对应 Run 目录
- **AND** spawned store/list/count/notification SHALL 不出现该 session

#### Scenario: Fresh Agent produces a freeform artifact

- **WHEN** fresh Agent turn 正常结束并返回最终文本
- **THEN** engine SHALL 将文本写入 workflow transcript
- **AND** SHALL 将文本关联为当前 stage 的 freeform artifact
- **AND** human Gate detail SHALL 能读取该 artifact

#### Scenario: Action confirmation precedes process creation

- **WHEN** Action confirm 生效但 Run 尚未 approve
- **THEN** engine SHALL 进入 `awaiting_action_confirmation` 并持久化 pending decision
- **AND** SHALL NOT 创建 command child process

#### Scenario: Action cwd and output stay in the frozen scope

- **WHEN** Action 使用默认或显式 cwd 执行
- **THEN** cwd SHALL 来自 parent session 冻结 Workspace snapshot 并通过授权校验
- **AND** stdout/stderr SHALL 写入 stage log
- **AND** snapshot SHALL 关联执行结果和 log 相对路径

### Requirement: Reconcile and shutdown are explicit, bounded and artifact-preserving

WorkflowEngine 启动时 SHALL 扫描 Workspace-owned v2 Run snapshot，校验 JSON 可读性、`snapshotSchemaVersion === 1`、inline frozenDefinition、definition schema 和 currentStageId。可解析但不兼容的 snapshot SHALL 写回 `interrupted` 和结构化 `WORKFLOW_SNAPSHOT_INCOMPATIBLE` 或 `WORKFLOW_DEFINITION_INCOMPATIBLE`；不得迁移、不得读取 live definition 推进，并 SHALL 保留 visitCounts、artifacts、transcript 和 action outputs。

`awaiting_start_confirmation`、`awaiting_gate_decision` 和 `awaiting_action_confirmation` 在重启后可恢复；没有 live ACP/Action handle 的 `running` SHALL 标记为 `interrupted`，不得重放 stage。parent session 删除 SHALL 将非终态 Run 标记为 `cancelled`；shutdown SHALL 将非终态 Run 标记为 `interrupted`。取消、timer、ACP 和 Action 资源 SHALL 在 ACP process pool/auxiliary process 终止前尽力结算并保留 Run 目录。

#### Scenario: Restart restores a human-waiting Run

- **WHEN** startup 发现合法 snapshot 状态为 awaiting_gate_decision
- **THEN** engine SHALL 恢复状态和 pending decision
- **AND** SHALL 将 Run 加入 active index 等待决策
- **AND** SHALL 不重复执行已完成的 Agent stage

#### Scenario: Running snapshot without live handle becomes interrupted

- **WHEN** startup 发现 running snapshot 但没有 live ACP/Action handle
- **THEN** engine SHALL 标记为 interrupted
- **AND** SHALL NOT 自动重放 stage
- **AND** SHALL 保留 artifacts、visitCounts、transcript 和 Action logs

#### Scenario: Parent deletion cancels its non-terminal Runs

- **WHEN** parent session 删除流程开始且存在非终态 Run
- **THEN** engine SHALL 取消 live ACP/Action/timer
- **AND** SHALL 将 Run 标记为 cancelled 并保留 snapshot/artifacts
- **AND** parent store 删除 SHALL 在取消请求之后执行

#### Scenario: Application shutdown fences new work

- **WHEN** shutdown fence 设置后仍有 active Run
- **THEN** engine SHALL 拒绝新的 trigger 和 stage 启动
- **AND** SHALL 在 ACP process pool 与辅助进程终止前执行 bounded dispose/force cleanup
- **AND** 非终态 Run SHALL 以 interrupted 保留在 Workspace storage

### Requirement: Workflow definition SHALL use the v2 schema and a separated Phase 1 execution profile

系统 SHALL 使用 `references/designs/workflow-engine/definition-schema.md` 解析手写 YAML 为 `WorkflowDefinition`。definition SHALL 满足 version `2`、顶层 `name`、合法 stage id/引用和 schema 的结构约束。定义态合法但超出 Phase 1 execution profile 的 workflow MAY 被保存，但 `trigger_workflow` SHALL 在创建 Run 前执行能力预检并结构化拒绝。

Phase 1 execution profile SHALL 只支持空 `requires`、`run.*` 模板引用、`AgentStage(context: fresh, produces: freeform)`、`ActionStage(op.type: exec)`、`Gate(type: human)`、Transition 和 `maxLoops`。`context: inherit`、`WaitStage`、`gate.type: expr/verdict`、结构化 artifact/op、`retry` 和 `idempotencyKey` SHALL 返回 `WORKFLOW_CONTEXT_UNSUPPORTED` 或 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，且 SHALL NOT 创建 Run。

#### Scenario: 保存定义态合法且可执行的 workflow

- **WHEN** 用户提交包含 `Agent(fresh, freeform)`、`Action(exec)`、`Gate(human)` 和合法 Transition 的 v2 YAML
- **THEN** 系统 SHALL 解析并保存完整 definition
- **AND** 后续 `trigger_workflow` SHALL 允许进入 Run 创建流程

#### Scenario: 保存定义态合法但 Phase 1 不支持的 workflow

- **WHEN** 用户保存包含 `context: inherit` 或 `WaitStage` 的合法 v2 YAML
- **THEN** 保存操作 SHALL 成功保留该 definition
- **AND** `trigger_workflow` SHALL 返回结构化不支持错误、包含 feature 或 stage 定位信息
- **AND** 系统 SHALL NOT 创建 Run、启动 ACP session 或启动 Action process

#### Scenario: YAML 或 definition schema 无效

- **WHEN** 用户提交无法解析的 YAML、缺少必填字段、stage id 重复或引用不存在的 stage
- **THEN** 保存操作 SHALL 返回具体 validation error
- **AND** 系统 SHALL NOT 静默修正内容或覆盖上一份合法 definition

#### Scenario: 不支持的模板和 requires 被拒绝

- **WHEN** workflow 使用非空 `requires` 或非 `run.*` 的模板引用
- **THEN** `trigger_workflow` SHALL 返回带有 feature/refs 的结构化拒绝
- **AND** SHALL NOT 通过删除引用、替换空字符串或跳过 stage 来继续执行

### Requirement: Workflow definitions SHALL be Workspace-owned with stable random identity

系统 SHALL 将手写 workflow definition 存储在 `workspaceDataDir(workspaceId)/workflows/<workflow-id>/definition.yaml`。新建 workflow SHALL 分配随机 `workflowId`，且该 ID SHALL 与 YAML 的 `name` 解耦。更新、重命名和删除 SHALL 按 workflowId 定位；重命名 SHALL NOT 移动 workflow 目录或改变既有 runs 的路径。

#### Scenario: 新建 workflow 分配稳定 ID

- **WHEN** 用户在 `/workflow` 页面第一次保存一份新 definition
- **THEN** Main SHALL 返回一个唯一 workflowId
- **AND** definition SHALL 写入以该 ID 命名的目录
- **AND** `name` SHALL 只作为 definition 内容和展示字段存在

#### Scenario: 重命名不改变 Run 历史路径

- **WHEN** 用户修改既有 workflow 的 YAML `name` 后按同一 workflowId 保存
- **THEN** 系统 SHALL 更新该 workflow 的 `definition.yaml`
- **AND** SHALL 保留 workflowId、runs 目录和已有 Run snapshot 路径
- **AND** SHALL NOT 按新 name 创建第二份 workflow

#### Scenario: 相同 Folder 被两个 Workspace 引用

- **WHEN** 两个 Workspace 都保存 workflow 或触发 workflow Run
- **THEN** 两者 SHALL 只读取各自 workspaceId 目录
- **AND** SHALL NOT 继承、合并或覆盖另一个 Workspace 的 definition/run 数据

#### Scenario: 旧名称型文件不参与发现

- **WHEN** appData 中仍存在旧的 `workflows/<name>.yaml` 文件
- **THEN** v2 definition list SHALL NOT 将该文件作为 workflow 返回
- **AND** `trigger_workflow` SHALL NOT 从该文件恢复或启动 Run

### Requirement: Workflow runtime SHALL have no built-in template or global staging source

Phase 1 SHALL NOT ship, discover or initialize any built-in workflow template. Workflow definition discovery SHALL only read the current Workspace's `workflows/<workflow-id>/definition.yaml`; it SHALL NOT read packaged `resources/workflows/built-in/**`, global `data/workflows`/`userData/workflows`, or copy files between those locations. The definition API SHALL NOT expose built-in/custom source semantics, read-only built-in protection, copy-on-save behavior or a built-in-specific delete error. Existing files in legacy global locations MAY remain on disk, but SHALL be inert and SHALL NOT be migrated, deleted automatically or used to create a Run.

#### Scenario: Packaged app has no built-in workflow asset

- **WHEN** the application is packaged and the workflow definition service starts
- **THEN** the package SHALL contain no `resources/workflows/built-in/**` workflow template
- **AND** startup SHALL not initialize or copy a workflow file into global `data/workflows`/`userData/workflows`
- **AND** `list_workflows` and definition list SHALL only return definitions from the current Workspace

#### Scenario: All discovered definitions share the same edit and delete contract

- **WHEN** a v2 definition is returned from the current Workspace workflow directory
- **THEN** the renderer and Main definition API SHALL treat it as a normal Workspace definition
- **AND** saving or deleting it SHALL use its `workflowId`
- **AND** the system SHALL NOT offer a built-in-only copy, read-only or delete-rejection branch

#### Scenario: Legacy global workflow staging remains inert

- **WHEN** old files exist under global `data/workflows` or `userData/workflows`
- **THEN** v2 definition list, `list_workflows`, trigger and startup reconcile SHALL ignore them
- **AND** the application SHALL NOT migrate, delete or execute those files

### Requirement: Run creation SHALL use trusted ownership, atomic snapshot creation and one active Run per parent

Workflow Run SHALL 归属于 `{workspaceId,parentSessionId}`，且 active 状态下同一复合 key SHALL 最多存在一个 Run。`trigger_workflow` 的调用方 SHALL 只提供 workflowId；parentSessionId SHALL 来自 Main 信任的 bundled MCP caller/Workspace context，不得接受 agent 自报的 parentSessionId。

创建 Run 前系统 SHALL 读取、解析并完成 Phase 1 preflight，然后组装完整的 `WorkflowRunSnapshot` 并以原子写入创建 `<run-id>/<run-id>.json`。创建成功前 SHALL NOT 向调用方返回 runId。快照 SHALL 包含 `snapshotSchemaVersion: 1`、完整 inline `frozenDefinition`、currentStageId、visitCounts、artifacts 和 status；不得使用 `workflowVersion`、仅 hash 或 live definition 引用。

#### Scenario: 创建普通 Run

- **WHEN** trusted chat caller 为不存在 active Run 的 parent session 触发可执行 workflow，且 `confirmStart` 为 false
- **THEN** 系统 SHALL 原子写入完整 snapshot
- **AND** Run SHALL 进入 `running` 并开始推进第一个 stage
- **AND** 返回的 runId SHALL 对应已经落盘的 snapshot

#### Scenario: 创建需要开始确认的 Run

- **WHEN** workflow 的 `confirmStart` 为 true
- **THEN** 系统 SHALL 创建并落盘 `awaiting_start_confirmation` snapshot
- **AND** SHALL 触发 Workflow Run wake
- **AND** `trigger_workflow` SHALL 立即返回 runId 和 awaiting 状态而不等待用户决策

#### Scenario: 同一 parent 存在 active Run

- **WHEN** `{workspaceId,parentSessionId}` 已有关联的 active Run，且调用方再次触发任意 workflow
- **THEN** 系统 SHALL 返回 `WORKFLOW_RUN_CONFLICT`
- **AND** SHALL NOT 创建第二个 Run、覆盖既有 snapshot 或启动新的 stage

#### Scenario: Snapshot 原子写入失败

- **WHEN** definition 已通过解析/preflight，但 Run snapshot 写入失败
- **THEN** `trigger_workflow` SHALL 返回持久化错误
- **AND** SHALL NOT 把未完整写入的 runId 返回给调用方
- **AND** SHALL NOT 启动 ACP session 或 Action process

### Requirement: Run transitions SHALL be serialized and follow definition Transition/maxLoops semantics

WorkflowEngine SHALL 通过等价于 `advance(snapshot,event): snapshot` 的纯状态迁移逻辑推进 Run。每个 Run 的 ACP 完成、Action 完成、人工决策、取消和错误事件 SHALL 进入同一串行队列/互斥区；每次有效推进 SHALL 在下一事件可见前原子持久化完整 snapshot。

系统 SHALL 按 `next`、`next.pass`、`next.fail`、`next.signal` 和 `maxLoops` 计算 stage 转移。达到终点 SHALL 进入 `succeeded`；失败、循环超限和未处理的执行错误 SHALL 进入 `failed` 并保留 stage/error 上下文。

#### Scenario: Action pass/fail/error 使用定义的分支

- **WHEN** `ActionStage(op.type: exec)` 以退出码 0 完成
- **THEN** engine SHALL 按 pass transition 计算下一个 stage
- **WHEN** Action 以退出码 1-126 完成
- **THEN** engine SHALL 按 fail transition 计算下一个 stage（可能回边重试）
- **WHEN** Action 以退出码 127 完成（命令不存在）或被 signal 终止
- **THEN** Run SHALL 进入 `failed` 状态
- **AND** snapshot SHALL 保留 `error.code = "ACTION_EXECUTION_ERROR"`
- **AND** engine SHALL NOT 按 fail transition 回边

#### Scenario: maxLoops 阻止无限回边

- **WHEN** 某 stage 的访问次数超过定义的 maxLoops
- **THEN** Run SHALL 进入 `failed`
- **AND** snapshot SHALL 保留 currentStageId、visitCounts 和可诊断错误
- **AND** engine SHALL NOT 继续执行回边后的 stage

#### Scenario: Human gate 等待用户决策

- **WHEN** `AgentStage` 完成并命中 `gate.type: human`
- **THEN** Run SHALL 先持久化为 `awaiting_gate_decision`
- **AND** SHALL NOT 自动选择 pass 或 fail
- **AND** 用户 approve SHALL 走 pass transition，reject SHALL 走 fail transition

#### Scenario: Start 或 Action confirmation 被拒绝

- **WHEN** 用户拒绝 start confirmation 或 action confirmation
- **THEN** Run SHALL 进入 `cancelled`
- **AND** 对应 ACP session/Action process SHALL NOT 启动
- **AND** SHALL NOT 把该拒绝改写为普通 stage fail 分支

### Requirement: Fresh Agent and exec Action SHALL use workflow-owned execution resources

`AgentStage(context: fresh)` SHALL 使用独立 workflow session owner、registry/store 和 Run 下的 transcript；不得调用 `SpawnedSessionManager.promptToAgent`，不得写入 spawned-session store、notification outbox、list 或 count。逻辑 workflow session ID SHALL 在 stage 启动前写入 snapshot，ACP session ID 可在连接解析后补写。Agent 最终响应文本 SHALL 作为 `freeform` artifact 保存。

`ActionStage(op.type: exec)` SHALL 只执行 definition 中的 command 和可选 cwd。cwd 缺省时 SHALL 使用 parent session 冻结 Workspace snapshot 的 primary Folder；显式 cwd SHALL 通过同一 snapshot 解析并校验。stdout/stderr SHALL 写入 Run 下的 `action-outputs/<stage-id>.log`，snapshot SHALL 保存相对日志路径、退出码或 signal 以及起止时间。Phase 1 SHALL NOT 增加隐含 workflow timeout。

#### Scenario: Fresh Agent 可见但不属于 spawned session

- **WHEN** Run 推进到 `AgentStage(context: fresh)`
- **THEN** 系统 SHALL 创建 workflow-owned fresh session 并记录其逻辑 session ID
- **AND** 该 session 的 transcript SHALL 位于对应 Run 目录
- **AND** `useSpawnedSessionStore`、spawned session list 和 spawned agent count SHALL 不出现该 session

#### Scenario: Fresh Agent 产生 freeform artifact

- **WHEN** fresh Agent turn 正常结束并返回最终文本
- **THEN** engine SHALL 将文本写入 workflow transcript
- **AND** SHALL 将该文本关联为当前 stage 的 freeform artifact
- **AND** 后续 human gate detail SHALL 能读取该 artifact

#### Scenario: Action confirm 在创建进程前等待

- **WHEN** Action 的 confirm 生效且 Run 尚未得到 approve
- **THEN** engine SHALL 进入 `awaiting_action_confirmation`
- **AND** SHALL 写入 pending decision
- **AND** SHALL NOT 创建 command child process

#### Scenario: Action 输出和 cwd 被限制

- **WHEN** Action 使用默认或显式 cwd 执行
- **THEN** cwd SHALL 来自 parent session 的冻结 Workspace snapshot 并通过授权校验
- **AND** stdout/stderr SHALL 写入该 stage 的 log 文件
- **AND** snapshot SHALL 能关联执行结果与 log 相对路径

### Requirement: Run reconcile and shutdown SHALL be explicit, bounded and artifact-preserving

WorkflowEngine 启动时 SHALL 扫描 Workspace-owned v2 Run snapshots并执行 reconcile。必须校验 JSON 可读性、`snapshotSchemaVersion === 1`、inline frozenDefinition、definition schema 和 currentStageId。可解析但不兼容的 snapshot SHALL 写回 `interrupted` 和结构化 `WORKFLOW_SNAPSHOT_INCOMPATIBLE` 或 `WORKFLOW_DEFINITION_INCOMPATIBLE`；不得迁移、不得读取 live definition 推进，并 SHALL 保留 visitCounts、artifacts、transcript 和 action outputs。

`awaiting_start_confirmation`、`awaiting_gate_decision` 和 `awaiting_action_confirmation` 在重启后可恢复到 active index；`running` 在没有 live ACP/Action handle 时 SHALL 标记为 `interrupted`，不得重放 stage。parent session 删除 SHALL 将其非终态 Run 标记为 `cancelled`；应用 shutdown SHALL 将其非终态 Run 标记为 `interrupted`。所有取消、timer、ACP 和 Action 资源 SHALL 在 ACP process pool/auxiliary process 终止前尽力结算并保留 Run 目录。

#### Scenario: 重启恢复人工等待

- **WHEN** 应用启动发现合法 snapshot 状态为 `awaiting_gate_decision`
- **THEN** engine SHALL 恢复该状态和 pending decision
- **AND** SHALL 将 Run 加入 active index 以等待用户决策
- **AND** SHALL 不重复执行已完成的 Agent stage

#### Scenario: 重启遇到 running snapshot

- **WHEN** 应用启动发现 snapshot 状态为 `running` 但没有 live ACP 或 Action handle
- **THEN** engine SHALL 将 Run 标记为 `interrupted`
- **AND** SHALL NOT 自动重放该 stage
- **AND** SHALL 保留已有 artifacts、visitCounts、transcript 和 Action logs

#### Scenario: Parent session 被删除

- **WHEN** parent session 删除流程开始且该 parent 有非终态 workflow Run
- **THEN** engine SHALL 取消 live ACP/Action 和 timer
- **AND** SHALL 将 Run 标记为 `cancelled` 并保留其 snapshot 与 artifacts
- **AND** parent session store 删除 SHALL 在该取消请求之后执行

#### Scenario: 应用退出

- **WHEN** shutdown fence 设置后仍有 active workflow Run
- **THEN** engine SHALL 拒绝新的 trigger 和 stage 启动
- **AND** SHALL 在 ACP process pool 与辅助进程终止前执行 bounded dispose/force cleanup
- **AND** 非终态 Run SHALL 以 `interrupted` 保留在 Workspace storage

## Implementation mapping

- Definition schema/parser/preflight/state transitions：`src/shared/types/workflow.ts`、`src/main/domain/automation/workflow/yaml-parser.ts`、`preflight.ts`、`state-machine.ts`。
- Workspace definition/Run persistence：`src/main/infra/storage/workspace-paths.ts`、`workflow-definition-store.ts`、`workflow-run-store.ts`。
- Unique runtime owner and lifecycle：`src/main/services/automation/workflow/workflow-engine.ts`、`workflow-agent-runner.ts`、`workflow-action-runner.ts`、`src/main/bootstrap/runtime.ts`、`shutdown.ts`。
- Workflow-owned session boundary：`src/main/services/session/workflow/**` and the explicitly exported session public surface.
- Contract and owner validation：`src/shared/ipc/automation/workflow*.ts`、`src/main/ipc/automation/workflow*.ts`、`src/preload/api/automation/workflow*.ts`。
- Regression and acceptance tests：`test/main/domain/automation/workflow/**`、`test/main/infra/storage/workflow-*.spec.ts`、`test/main/services/automation/workflow/**`、`test/main/services/session/workflow/**`、`test/main/ipc/automation/workflow*.spec.ts`、`test/main/packaging/workflow-resources.spec.ts`。

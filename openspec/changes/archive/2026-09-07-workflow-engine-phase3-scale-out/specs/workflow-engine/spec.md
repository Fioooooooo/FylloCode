## MODIFIED Requirements

### Requirement: Workflow definition uses v2 schema and a separate Phase 1 execution profile

系统 SHALL 使用 `references/designs/workflow-engine/definition-schema.md` 将手写 YAML 解析为 `WorkflowDefinition`。definition SHALL 使用 version `2`、顶层 `name`、合法 stage id/引用和 schema 约束。定义态合法但超出当前 execution profile 的 workflow MAY 被保存，但 `trigger_workflow` SHALL 在创建 Run 前执行 capability preflight 并结构化拒绝。

Phase 3 execution profile SHALL 支持空 `requires`、`requires` 包含 `task` 时的 `task.*` 模板引用、`run.*` 模板引用、`AgentStage(context: fresh, produces: freeform)`、`ActionStage(op.type: exec | write.field | write.comment)`、`Gate(type: human)`、合法 Transition 和 `maxLoops`。`write.*` 的 task context、provider capability 和幂等约束 SHALL 在 trigger preflight 中验证。`context: inherit`、`WaitStage`、`gate.type: expr/verdict`、结构化 artifact/op、`retry` 以及未实现的 ActionOp SHALL 返回 `WORKFLOW_CONTEXT_UNSUPPORTED` 或 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，且 SHALL NOT 创建 Run。`tracker.transition` 与 `tracker.comment` SHALL 从 ActionOp 中移除，旧 definition SHALL NOT 被静默转换。

#### Scenario: Phase 3 可执行 definition 被保存并可触发

- **WHEN** 用户提交包含 Agent fresh/freeform、Action exec 或满足 task 前置条件的 `write.*`、human Gate 和合法 Transition 的 v2 YAML
- **THEN** 系统 SHALL 保存完整 definition
- **AND** 后续 `trigger_workflow` SHALL 在 capability preflight 通过后进入 Run 创建流程

#### Scenario: 定义态合法但超出 execution profile 的 definition 被拒绝执行

- **WHEN** 用户保存包含 `context: inherit`、Wait、结构化 artifact 或未实现 ActionOp 的合法 v2 YAML
- **THEN** 保存 SHALL 成功
- **AND** `trigger_workflow` SHALL 返回带 stage/feature refs 的结构化拒绝
- **AND** 系统 SHALL NOT 创建 Run、ACP session 或 Action process

#### Scenario: 旧 tracker ActionOp 不做兼容转换

- **WHEN** definition 使用 `tracker.transition` 或 `tracker.comment`
- **THEN** YAML schema validation SHALL 返回具体 ActionOp validation error
- **AND** 系统 SHALL NOT 将其转换为 `write.field` 或 `write.comment`
- **AND** 系统 SHALL NOT 为该 definition 创建 Run

#### Scenario: task 模板只在声明 task 前置条件时可用

- **WHEN** definition 引用 `task.*` 但 `requires` 不包含 `task`
- **THEN** 保存或 trigger preflight SHALL 返回带模板引用定位的结构化错误
- **AND** 系统 SHALL NOT 以空字符串替换该引用继续执行

### Requirement: Workflow definition SHALL use the v2 schema and a separated Phase 1 execution profile

系统 SHALL 使用 `references/designs/workflow-engine/definition-schema.md` 解析手写 YAML 为 `WorkflowDefinition`。definition SHALL 满足 version `2`、顶层 `name`、合法 stage id/引用和 schema 的结构约束。定义态合法但超出当前 execution profile 的 workflow MAY 被保存，但 `trigger_workflow` SHALL 在创建 Run 前执行能力预检并结构化拒绝。

Phase 3 execution profile SHALL 支持空 `requires`、`requires` 包含 `task` 时的 `task.*` 模板引用、`run.*` 模板引用、`AgentStage(context: fresh, produces: freeform)`、`ActionStage(op.type: exec | write.field | write.comment)`、`Gate(type: human)`、Transition 和 `maxLoops`。`write.*` 的 task context、provider capability 和幂等约束 SHALL 在 trigger preflight 中验证。`context: inherit`、`WaitStage`、`gate.type: expr/verdict`、结构化 artifact/op、`retry` 以及未实现的 ActionOp SHALL 返回 `WORKFLOW_CONTEXT_UNSUPPORTED` 或 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，且 SHALL NOT 创建 Run。`tracker.transition` 与 `tracker.comment` SHALL 从 ActionOp 中移除，旧 definition SHALL NOT 被静默转换。

#### Scenario: 保存定义态合法且可执行的 Phase 3 workflow

- **WHEN** 用户提交包含 `Agent(fresh, freeform)`、`Action(exec)` 或合法 `write.*`、`Gate(human)` 和合法 Transition 的 v2 YAML
- **THEN** 系统 SHALL 解析并保存完整 definition
- **AND** 后续 `trigger_workflow` SHALL 在 preflight 通过后允许进入 Run 创建流程

#### Scenario: 保存定义态合法但当前 profile 不支持的 workflow

- **WHEN** 用户保存包含 `context: inherit`、`WaitStage` 或未实现 ActionOp 的合法 v2 YAML
- **THEN** 保存操作 SHALL 成功保留该 definition
- **AND** `trigger_workflow` SHALL 返回结构化不支持错误、包含 feature 或 stage 定位信息
- **AND** 系统 SHALL NOT 创建 Run、启动 ACP session 或启动 Action process

#### Scenario: 不支持的模板和 requires 被拒绝

- **WHEN** workflow 使用未声明的 `task.*` 模板或其他当前 profile 不支持的模板/requirement
- **THEN** `trigger_workflow` SHALL 返回带有 feature/refs 的结构化拒绝
- **AND** SHALL NOT 通过删除引用、替换空字符串或跳过 stage 来继续执行

#### Scenario: tracker ActionOp 被移除

- **WHEN** workflow 使用 `tracker.transition` 或 `tracker.comment`
- **THEN** parser SHALL 返回 ActionOp validation error
- **AND** SHALL NOT 静默转换、迁移或创建 Run

## ADDED Requirements

### Requirement: Workflow Run snapshot freezes the trusted task context

当 definition 需要 `task` context 且 trigger preflight 成功时，系统 SHALL 在创建 Run 前通过 parent Chat session 的可信 `originTaskRef` 调用现有 TaskAggregator 读取一次任务。系统 SHALL 将窄化后的 `taskContext` 写入 `WorkflowRunSnapshot`，至少包含完整 task reference、provider、title 和纯文本 description，可选包含 provider URL。后续 Agent、Action、重启恢复和状态推进 SHALL 只使用该 snapshot，不得重新读取外部任务。

#### Scenario: 合法 task context 被冻结到 snapshot

- **WHEN** trusted Chat parent 有 `originTaskRef` 且 workflow 声明 `requires: [task]`
- **THEN** trigger SHALL 读取对应任务并在创建 Run 前完成 capability preflight
- **AND** snapshot SHALL 包含该任务的窄化 taskContext
- **AND** `task.id` SHALL 表示完整 source-prefixed task reference，`task.description` SHALL 是可直接插值的字符串

#### Scenario: 缺少可信 task context 时不创建 Run

- **WHEN** workflow 需要 `task` 但 parent Chat session 没有 `originTaskRef`，或任务无法由当前 Workspace 读取
- **THEN** trigger SHALL 返回 `WORKFLOW_CONTEXT_UNSUPPORTED` 结构化错误
- **AND** SHALL NOT 返回 runId、写入 Run snapshot 或启动 ACP/Action 资源

#### Scenario: Run 推进使用冻结值

- **WHEN** 外部任务在 Run 创建后发生变化，或 Run 在应用重启后恢复
- **THEN** `task.*` 模板 SHALL 继续使用 snapshot.taskContext
- **AND** WorkflowEngine SHALL NOT 重新读取、刷新、轮询或重新绑定外部任务

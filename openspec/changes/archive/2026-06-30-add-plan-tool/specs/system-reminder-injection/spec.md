## ADDED Requirements

### Requirement: chat reminder 指导三级任务分流

系统 SHALL 在 chat owner 的 system-reminder 中注入三级任务分流规则：

- **直接实现**：适用于局部、明确、低风险、可逆，且不改变外部行为契约的任务。
- **Plan**：适用于不改变外部行为契约，但涉及多文件、多方案或需要架构取舍的任务。
- **Proposal**：适用于改变行为契约的任务，包括新增/删除 requirement、改变现有 SHALL、改变 public API surface、data schema、interface contract、storage format、用户可见默认/空态/错误态或跨模块 ownership boundary。

reminder SHALL 要求 Agent 在 Plan 过程中一旦发现会改变行为契约，停止 Plan 直接实施路径并升级为 Proposal。reminder SHALL 要求 Agent 在 Proposal 方案不清时，可以先通过 Plan 探索非最终方案，但最终契约变更仍必须沉淀为 Proposal。
reminder SHALL 要求 Agent 使用两问判定任务轨道：先判断是否改变系统行为契约，若改变则使用 Proposal；若不改变，再判断实现方式是否能从当前上下文完全确定，若需要探索和取舍则使用 Plan，否则直接实现。

#### Scenario: reminder 包含三级分流

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** 文本包含直接实现、Plan、Proposal 三类任务分流
- **AND** 文本说明 Plan 只适用于不改变外部行为契约的复杂任务
- **AND** 文本说明契约变更必须走 Proposal

#### Scenario: Plan 发现契约变更时升级

- **WHEN** Agent 正在 Plan 阶段调研
- **AND** 发现需要新增 public API surface 或改变 data schema
- **THEN** reminder 指示 Agent 停止直接实施路径
- **AND** 与用户对齐后调用 `mcp__fyllo_specs__create-proposal`

### Requirement: chat reminder 指导 create-plan 与批准后实施

系统 SHALL 在 chat owner 的 system-reminder 中说明 `mcp__fyllo_specs__create-plan` 的使用规则：

- Agent 只有在用户要求创建 plan，或 Agent 建议创建 plan 且用户同意后，才 SHALL 调用 `create-plan`。
- Agent 调用 `create-plan` 时 SHALL 只传 `goal` 与 Agent 提供的 `slug` 片段，不得传 `targetPath`、workspace path、本地文件路径或 `includeInstruction`。
- Agent 调用 `create-plan` 后 SHALL 使用 tool 返回的 `state.planPath` 写入完整 plan 文档。
- Agent 写完 plan 后 SHALL 输出 `<fyllo-action type="plan.create">`，payload 只包含 `slug` 与 `goal`，不得包含 `planPath`。
- 在 plan 被用户批准前，Agent SHALL 只做探索、分析和 plan 文档写入，SHALL NOT 修改业务代码。
- 当用户发送包含 plan slug 的 approved-plan confirmation message 后，Agent SHALL 重新读取最新 plan 文件，再按 plan 实施。

#### Scenario: reminder 禁止 planPath 进入 action payload

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** 文本说明 `plan.create` payload 不得包含 `planPath`
- **AND** 文本说明 renderer 会通过 FylloCode IPC 根据 session 和 slug 读取 plan

#### Scenario: plan 批准后允许实施

- **WHEN** 用户确认 Plan Slideover 并发送确认消息
- **THEN** reminder 指示 Agent 重新读取最新 plan
- **AND** 若 plan 不涉及行为契约变更，Agent 可以按 plan 修改代码

### Requirement: chat reminder 注入 plan.create action contract

系统 SHALL 通过 shared Fyllo action contract 注册表向 chat owner reminder 注入 `plan.create` action contract。注入内容 SHALL 来自 shared contract，而不是在 chat reminder 模板中手写一份 payload schema。

#### Scenario: chat reminder 包含 plan.create contract

- **WHEN** 主进程为 chat owner 渲染 system-reminder
- **THEN** reminder 文本包含 `<fyllo-action type="plan.create">`
- **AND** reminder 文本包含 `plan.create` 的 payload 字段 `slug` 与 `goal`
- **AND** reminder 文本说明 payload 不允许未知字段

#### Scenario: apply 和 archive reminder 不注入 plan.create contract

- **WHEN** 主进程为 apply 或 archive owner 渲染 system-reminder
- **THEN** reminder 文本不追加 chat-only 的 `plan.create` action type contract 列表

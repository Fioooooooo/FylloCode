## ADDED Requirements

### Requirement: Session-scoped plan document

系统 SHALL 支持在当前 chat session 下创建轻量 plan 文档。plan 文件 SHALL 存储在当前项目数据目录的 session 子目录内：

```text
projects/<encodedProjectPath>/sessions/<sessionId>/plans/<yyyy-MM-dd-agent-slug>.md
```

`create-plan` 接收的 `slug` SHALL 是 Agent 提供的 kebab-case 片段，且 SHALL NOT 包含日期前缀、路径分隔符、`.`、`..` 或空白。tool SHALL 使用当前日期生成完整 slug：`yyyy-MM-dd-<agent-slug>`。完整 slug 仅在该 `sessionId` 的 `plans/` 目录内唯一；系统 SHALL NOT 要求不同 session 的完整 slug 全局唯一。

plan 文件 SHALL 包含 YAML frontmatter 与固定正文 heading。frontmatter 字段 SHALL 包含：

- `slug: <yyyy-MM-dd-agent-slug>`
- `goal: <one-sentence summary>`
- `createdAt: <ISO 8601 timestamp>`
- `status: draft`

正文 SHALL 包含以下固定二级 heading：`任务目标/Goal`、`范围边界/Scope`、`关键约束/Constraints`、`方案取舍/Trade-offs`、`实施步骤/Steps`、`验证方式/Verification`。

`status` SHALL 只允许 `"draft"` 与 `"approved"`。新建 plan 初始为 `"draft"`。

#### Scenario: create-plan 创建 session plan 骨架

- **WHEN** Agent 调用 `create-plan`，入参 `slug = "refactor-chat-store"`，且当前日期为 `2026-06-29`
- **THEN** tool 在当前 `sessionId` 的 `plans/` 目录下创建 `2026-06-29-refactor-chat-store.md`
- **AND** frontmatter 中 `slug === "2026-06-29-refactor-chat-store"`
- **AND** frontmatter 中 `status === "draft"`
- **AND** 正文包含六个固定二级 heading

#### Scenario: 不同 session 可使用相同完整 slug

- **WHEN** session A 与 session B 在同一天分别创建 Agent slug 都为 `"refactor-chat-store"` 的 plan
- **THEN** 两个 plan 分别写入各自 session 的 `plans/` 目录
- **AND** 系统不把完整 slug 当作项目级唯一 id 校验

### Requirement: Plan review action

系统 SHALL 支持 `plan.create` Fyllo action type，用于在 Chat 主会话中让用户审阅并批准当前 session 的 plan。

`plan.create` payload SHALL 为严格 JSON object：

```json
{
  "slug": "string, full yyyy-MM-dd-agent-slug",
  "goal": "string, non-empty"
}
```

payload SHALL NOT 包含 `planPath`、`sessionId`、按钮文案、handler 名称、IPC channel 或组件名。renderer SHALL 从 Fyllo action host context 获取当前 chat `sessionId`，并通过 `{ projectId, sessionId, slug }` 读取 plan。

#### Scenario: plan.create payload 不包含本地路径

- **WHEN** assistant 输出 `plan.create` action
- **THEN** payload 只包含 `slug` 与 `goal`
- **AND** renderer 不从 payload 读取本地文件路径
- **AND** plan 文件路径由主进程 IPC 根据 `projectId`、`sessionId` 与 `slug` 推导

#### Scenario: 缺少 sessionId 时 action 失败

- **WHEN** 用户确认 `plan.create` action
- **AND** 当前渲染上下文无法提供 chat `sessionId`
- **THEN** dispatcher 不调用 plan IPC
- **AND** action card 进入 failed 状态并展示错误信息

### Requirement: Plan Slideover review and approval

系统 SHALL 提供 Plan Slideover 供用户审阅 plan。Slideover SHALL 通过领域 composable 打开，不由业务组件直接创建 overlay。Slideover SHALL 支持 review 模式与 readonly 模式。

review 模式 SHALL：

- 打开后通过 `lineage:readPlan` 读取 plan。
- 使用 markdown 编辑器展示和编辑 plan 正文。
- 保存正文时通过 `lineage:savePlanBody` 写回，且 SHALL 保留 frontmatter。
- Footer 显示“确认”按钮。
- 用户点击“确认”时调用 `lineage:approvePlan`，将 frontmatter `status` 从 `"draft"` 更新为 `"approved"`。
- `approvePlan` 成功后发送用户消息：`我已确认规划方案：<slug>`。

用户关闭 Slideover 但未点击“确认”时，系统 SHALL 视为 dismissed，不批准 plan，不写入 action succeeded 状态。

readonly 模式 SHALL 只读取并展示 plan，不允许编辑正文，也不显示确认按钮。

#### Scenario: 用户批准 plan

- **WHEN** 用户从 `plan.create` action 打开 Plan Slideover
- **AND** 用户编辑正文后点击“确认”
- **THEN** 系统先保存最新正文
- **AND** 调用 `lineage:approvePlan` 把 frontmatter `status` 更新为 `"approved"`
- **AND** chat store 发送用户消息 `我已确认规划方案：<slug>`
- **AND** `plan.create` action card 写入 succeeded 状态

#### Scenario: 用户关闭但未批准

- **WHEN** 用户从 `plan.create` action 打开 Plan Slideover
- **AND** 用户关闭 Slideover 但未点击“确认”
- **THEN** plan frontmatter `status` 保持 `"draft"`
- **AND** `plan.create` action handler 返回 dismissed
- **AND** Chat session meta 中不写入该 action 的 `actionStates`

### Requirement: Approved plan implementation handoff

当 Agent 收到用户确认消息 `我已确认规划方案：<slug>` 后，Agent SHALL 重新读取该 slug 对应的最新 plan 文件，再按 plan 实施。若实施前或实施中发现该任务会改变外部行为契约、public API surface、data schema、interface contract、storage format、用户可见默认/空态/错误态或跨模块 ownership boundary，Agent SHALL 停止直接实施并升级为 Proposal。

#### Scenario: 批准后重新读取 plan

- **WHEN** 用户确认 plan 后发送 `我已确认规划方案：2026-06-29-refactor-chat-store`
- **THEN** Agent 重新读取该 plan 文件
- **AND** 按用户可能在 Slideover 中修改后的最新内容实施

#### Scenario: Plan 实施中发现契约变更

- **WHEN** Agent 按 approved plan 实施
- **AND** 发现需要新增 public API surface 或改变 data schema
- **THEN** Agent 停止直接实施
- **AND** 与用户确认升级为 Proposal

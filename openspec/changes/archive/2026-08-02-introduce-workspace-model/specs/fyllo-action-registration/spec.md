## MODIFIED Requirements

### Requirement: Renderer registers ready actions immediately after parsing

系统 SHALL 在 Markstream 解析到合法 `ready` Fyllo Action 后立即通过 IPC 向 Main 注册，注册 SHALL 发生在 Action UI 展示之后或同时，且 SHALL 不等待用户确认。

`registerAction` IPC SHALL 携带 `workspaceId`、`sessionId`、`actionId` 和 `type`。Renderer 提供的 `actionId` SHALL 使用当前位置型规则构造；Main 不生成或重写 `actionId`。

Renderer 注册前应检查本地 persistedState，若已存在同一 `actionId` 则跳过注册；注册失败后 SHALL 保留 Action UI 并允许用户重试同步。

#### Scenario: Ready parse result triggers registration

- **WHEN** Markstream 将某个 Action 从 `pending` 推进到 `ready`
- **THEN** Renderer SHALL 调用 `registerAction` 一次
- **AND** 同一 Action 在组件 remount 或 reactive 更新后 SHALL 不重复调用

#### Scenario: Registration failure keeps UI actionable

- **WHEN** `registerAction` IPC 返回失败
- **THEN** Renderer SHALL 继续展示该 Action 的 ready UI
- **AND** Renderer SHALL 提供可重试的状态同步入口
- **AND** 用户 SHALL 仍可点击确认或取消

### Requirement: Main creates ready state idempotently

`registerAction` handler SHALL 校验 sender 所属 Workspace、session 归属、`sessionId` 安全性、`actionId` 非空、`type` 为支持的 confirm Action。

若 `actionId` 不存在，Main SHALL 创建 `status="ready"`、`revision=1` 的 `FylloActionState`，使用 Main 生成的 `updatedAt`，并返回当前 record。

若 `actionId` 已存在且 `type` 一致，Main SHALL 原样返回当前 record，SHALL 不更新 `updatedAt`，SHALL 不递增 `revision`，SHALL 不修改 session 列表排序时间。

若 `actionId` 已存在但 `type` 不一致，Main SHALL 返回冲突错误，SHALL 不修改现有 record。

`registerAction` SHALL NOT 用 `ready` 覆盖已存在的 `succeeded`、`failed` 或 `cancelled` 状态。

#### Scenario: First registration creates ready record

- **WHEN** `registerAction` 收到一个不存在于 `actionStates` 的 `actionId`
- **THEN** Main SHALL 写入 `ready` 状态
- **AND** 返回的 record SHALL 包含 `revision=1`
- **AND** `updatedAt` SHALL 由 Main 生成

#### Scenario: Remount registration is idempotent

- **WHEN** `registerAction` 收到一个已存在 `ready` 记录的 `actionId`，且 `type` 一致
- **THEN** Main SHALL 返回现有 record
- **AND** Main SHALL 不更新 `updatedAt`
- **AND** Main SHALL 不递增 `revision`

#### Scenario: Type mismatch returns conflict

- **WHEN** `registerAction` 收到一个已存在记录的 `actionId`，但 `type` 不一致
- **THEN** Main SHALL 返回冲突错误
- **AND** 现有记录 SHALL 保持不变

#### Scenario: Ready does not overwrite terminal state

- **WHEN** `registerAction` 收到一个已存在 `succeeded`、`cancelled` 或 `failed` 记录的 `actionId`
- **THEN** Main SHALL 返回现有终态 record
- **AND** 现有终态记录 SHALL 不被覆盖为 `ready`

### Requirement: Session ID and project ownership are validated

系统 SHALL 抽取 `safeSessionIdSchema`，限制 `sessionId` 只能包含 `a-z`、`A-Z`、`0-9`、`_`、`-`，即正则 `^[a-zA-Z0-9_-]+$`；该字符集与现有 `session-{nanoid(10)}` 格式兼容，并拒绝路径分隔符、`..`、空字符串等危险输入。

`registerAction` handler SHALL 从 sender `WebContents` 通过 `WorkspaceWindowManager.getContextByWebContents()` 获取窗口所属 `workspaceId`，并校验 Renderer 提供的 `workspaceId` 与该上下文一致；Renderer 单独提供的 `workspaceId` 不能作为唯一授权依据。

`registerAction` SHALL 校验目标 session 属于该校验后的 Workspace。

#### Scenario: Cross-Workspace registration is rejected

- **WHEN** Renderer 提交的 `workspaceId` 与 sender 窗口实际所属 Workspace 不一致
- **THEN** Main SHALL 拒绝该请求
- **AND** 任何 session meta SHALL 不被修改

#### Scenario: Path traversal session ID is rejected

- **WHEN** `sessionId` 包含 `..`、`/` 或 `\`
- **THEN** schema 校验 SHALL 失败
- **AND** Main SHALL 拒绝该请求

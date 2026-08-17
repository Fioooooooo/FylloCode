# fyllo-spawn-cancellation Specification

## Purpose

定义父 Agent 通过 `cancel_session` tool 主动取消正在运行的 spawned session 的能力，包括取消语义、状态映射、资源释放和错误码约束。取消是异步的"尽力而为"操作，最终状态通过 `check_session_status` 确认。

## Requirements

### Requirement: fyllo-spawn 提供 cancel_session tool

系统 SHALL 在 fyllo-spawn MCP server 中新增 `cancel_session` tool，接受 `sessionId` 参数，允许父 Agent 主动取消属于当前 owner 的正在运行的 spawned session。

`cancel_session` 返回 `{ cancelled: true }` 表示取消请求已接受并触发，但不保证 ACP turn 已确认取消。父 Agent SHALL 通过 `check_session_status` 查询最终状态以确认 turn 是否真正终止。

#### Scenario: 取消正在运行的 session

- **WHEN** 父 Agent 调用 `cancel_session` 并提供正在运行的 spawned sessionId
- **THEN** 系统 SHALL 调用对应 ACP session 的 cancel
- **AND** 返回 `{ cancelled: true }`
- **AND** `cancelled: true` 表示取消请求已触发，不表示 ACP 已确认取消

#### Scenario: 取消不存在或非运行状态的 session

- **WHEN** 父 Agent 调用 `cancel_session` 但目标 session 不在 `activeTurns` 中（不存在、已终止或跨 owner）
- **THEN** 系统 SHALL 返回 `{ cancelled: false, reason: "Session not found" }`
- **AND** 不执行任何取消操作
- **AND** 不区分"不存在"、"已终止"和"跨 owner"场景，统一返回相同消息以避免泄露信息

### Requirement: 被取消的 session 标记为 TURN_CANCELLED_BY_PARENT 并持久化为 error

被 `cancel_session` 主动取消的 spawned session SHALL 在 turn record 和 session meta 中记录错误码 `TURN_CANCELLED_BY_PARENT`，区别于 inactivity timeout 和用户手动取消。系统 SHALL 将其持久化为 `status: "error"` 而非 `status: "expired"`，确保 `check_session_status` 返回的状态描述精准无歧义。

系统 SHALL 保持现有 forceError 错误码的状态映射不变：

- `AGENT_PROCESS_INVALIDATED` → `status: "expired"`
- `APP_SHUTDOWN` → `status: "error"`, `phase: "interrupted"`
- `TURN_CANCELLED_BY_PARENT` → `status: "error"`, `phase: "expired"`
- 其他现有错误码（如 `PARENT_SESSION_DELETED`）保持原有映射逻辑不变

#### Scenario: 取消后的状态持久化

- **WHEN** `cancel_session` 成功触发取消且 ACP session 确认取消
- **THEN** turn record SHALL 转换为 expired phase
- **AND** status SHALL 为 `"error"`（不是 `"expired"`）
- **AND** error code SHALL 为 `TURN_CANCELLED_BY_PARENT`
- **AND** message SHALL 为 "Parent Agent cancelled this spawned session"

#### Scenario: 取消后查询状态

- **WHEN** spawned session 被父 Agent 取消后，父 Agent 调用 `check_session_status`
- **THEN** 系统 SHALL 返回 `status: "error"`
- **AND** error code SHALL 为 `TURN_CANCELLED_BY_PARENT`
- **AND** message SHALL 精准描述为主动取消，避免与 process invalidation（`expired`）混淆

### Requirement: 取消未确认时的状态转换和资源释放

如果 5 秒内 turn 未 settled，`cancelSession` SHALL 在等待上限后返回 `{ cancelled: true }`，且 SHALL 不清理对应的 active turn、覆盖 `forceError` 或写入其他错误码。

对应 turn SHALL 保持由现有 `completion`/`settledPromise` 路径管理，直至其自然 settled 并执行既有清理。最终持久化错误码仍为 `TURN_CANCELLED_BY_PARENT`。

`forceError` 机制用于标记取消原因。`runner.cancel()` 触发实际取消，并最终通过 `completion` promise resolve 完成清理。系统 SHALL 复用现有的 `PARENT_SESSION_DELETED` 模式：设置 `forceError` → 调用 `runner.cancel()` → 等待 `settledPromise` 或 5 秒超时。

#### Scenario: 取消未在 grace period 内确认

- **WHEN** `cancel_session` 调用后，5 秒内 turn 未 settled
- **THEN** `cancelSession` 方法 SHALL 返回 `{ cancelled: true }`
- **AND** turn SHALL 继续运行直到自然终止
- **AND** 最终 turn 状态 SHALL 为 `status: "error"`，错误码 `TURN_CANCELLED_BY_PARENT`（因为 `forceError` 已设置）
- **AND** turn settled 时释放父级和全局 active 容量计数、清理 inactivity timer 和 activeTurns 记录

#### Scenario: 取消在 grace period 内确认

- **WHEN** `cancel_session` 调用后，turn 在 5 秒内 settled
- **THEN** `cancelSession` 方法 SHALL 在 turn settled 后返回 `{ cancelled: true }`
- **AND** turn 终态 SHALL 为 `status: "error"`，错误码 `TURN_CANCELLED_BY_PARENT`
- **AND** 立即释放资源

### Requirement: cancel_session 不影响并发限制和清理逻辑

`cancel_session` 触发的取消 SHALL 复用现有的 turn 清理逻辑，包括释放 active 容量计数、清理 inactivity timer、调用 runner cancel 和等待 settled promise。

#### Scenario: 取消后并发槽位释放

- **WHEN** 父 Agent 取消一个占用并发槽位的 spawned session
- **THEN** 系统 SHALL 在 turn settled 后释放父级和全局 active 计数
- **AND** 新的 spawn 请求 SHALL 能够使用该释放的槽位

#### Scenario: 取消期间再次发送 prompt

- **WHEN** spawned session 正在取消但尚未 settled
- **THEN** 对同一 session 的新 prompt 请求 SHALL 返回 busy
- **AND** 直到 turn settled 后状态变为 error

### Requirement: Tool description 说明取消的语义和限制

`cancel_session` tool description SHALL 明确说明：

- 只能取消当前 owner 的 running session
- `cancelled: true` 表示取消请求已触发，不表示 ACP 已确认取消
- 取消是异步的，最终状态须通过 `check_session_status` 确认
- 取消后 session 进入不可续用的 error 状态
- 如果 session 不在运行状态（或不存在、跨 owner），返回 `cancelled: false` 和统一的 "Session not found" 消息

#### Scenario: Agent 阅读 tool description

- **WHEN** 父 Agent 查询 fyllo-spawn 的可用 tools
- **THEN** `cancel_session` description SHALL 包含参数说明和返回值说明
- **AND** 明确 `cancelled: true` 的语义为"请求已触发"
- **AND** 建议通过 `check_session_status` 确认最终状态
- **AND** 说明取消是异步的，不保证立即生效

## Context

当前 fyllo-spawn 系统通过 HTTP-only bundled MCP 提供了 4 个 tools（`available_agents`、`prompt_to_agent`、`check_session_status`、`read_response`），允许父 Chat Session 将工作委派给独立的 spawned ACP sessions。

**现有限制**：

1. 父 Agent 无法主动取消已启动的 spawned session，只能依赖 10 分钟 inactivity timeout 或等待任务自然完成
2. `background` 参数默认 `false`，导致大多数调用采用同步阻塞模式，父 Agent 和用户都看不到两个 Agent 的并行工作状态
3. Agent system prompt 中的 `spawn.session` Signal 规则不够明确，容易导致可观测性不足

**技术背景**：

- Spawned sessions 复用全局 ACP process pool 和统一的 `AcpSession` activation
- 并发限制：单 spawned session 1 个 active turn，单父 Session 4 个，全局 8 个
- 现有 runner 已支持 `cancel()` 方法，但未对外暴露
- Turn record 和 session meta 已包含 error code/message 字段用于状态记录

## Goals / Non-Goals

**Goals:**

1. 提供 `cancel_session` tool，让父 Agent 能主动取消不需要的 spawned session
2. 修改 `background` 默认值为 `true`，鼓励异步使用模式，提升可观测性
3. 优化 tool description 和 Signal 规则，引导 Agent 正确使用异步模式

**Non-Goals:**

- 不改变现有的并发限制（1/4/8）或 inactivity timeout（10 分钟）
- 不改变 spawned session 的生命周期管理、持久化或 notification 机制
- 不增加新的 Agent 能力或 MCP server（只在现有 fyllo-spawn 中扩展）
- 不引入复杂的取消确认或回调机制（保持简单的一次性取消）

## Decisions

### 决策 1：cancel_session 返回简单的成功/失败状态

**选择**：返回 `{ cancelled: boolean, reason?: string }`

**替代方案**：

- 返回完整的 turn record 状态
- 异步返回，等待取消确认

**理由**：

- 简单的布尔值足够让 Agent 知道操作是否生效
- 取消是"尽力而为"，不保证立即生效，过于详细的状态可能误导
- 父 Agent 可以通过 `check_session_status` 查询最终状态
- 保持 tool 接口简洁，降低使用复杂度

### 决策 2：background 默认值改为 true

**选择**：将 `background: z.boolean().default(true)` 作为新默认值

**替代方案**：

- 移除 `background` 参数，强制所有调用都是异步
- 保持默认 `false`，通过文档鼓励异步

**理由**：

- Spawn 的典型场景是长耗时任务，异步是更合理的默认行为
- 保留参数给需要同步阻塞的少数场景（简单快速任务）
- 默认值的改变会"推"着 Agent 采用更好的实践
- 破坏性变更可控：显式传参的代码不受影响

### 决策 3：复用现有 forceError + runner.cancel() 机制

**选择**：在 `spawned-session-manager` 中添加 `cancelSession` 方法，设置 `forceError` 并调用 `runner?.cancel()`，复用 `PARENT_SESSION_DELETED` 的模式

**替代方案**：

- 创建独立的取消通道
- 使用 AbortSignal 机制

**理由**：

- 现有的 `forceError` + `runner.cancel()` 已用于 parent deletion 和 shutdown 场景
- `forceError` 用于标记取消原因，`runner.cancel()` 触发实际取消，`completion` promise 完成清理
- 复用相同逻辑保证一致性，减少维护成本
- 错误码 `TURN_CANCELLED_BY_PARENT` 明确区分取消来源
- `PARENT_SESSION_DELETED` 的实现已验证：设置 forceError → 调用 runner.cancel() → 等待 settledPromise 或 5 秒超时

### 决策 4：优化异步模式的 Signal 规则，同步模式接受延迟

**选择**：在 `<fyllo-signal-contract>` 中明确异步新建 session 应立即输出 Signal，同步模式保持现状（工具返回后输出）

**替代方案**：

- 在 Main 端自动插入 Signal 到 Agent 响应中
- 修改 `prompt_to_agent` 支持流式响应，让同步调用也能在 accepted 时发送 Signal

**理由**：

- **异步模式（推荐）**：Agent 在 `accepted` 返回后立即输出 Signal，时机足够早，满足可观测性需求
- **同步模式（妥协）**：因为同步调用阻塞到完成，Agent 无法在执行期间输出任何内容。修改协议支持流式响应成本过高，投入产出比不合理
- **策略**：通过默认 `background: true` 和清晰的文档引导，让绝大多数场景使用异步模式
- **接受的限制**：少数使用 `background: false` 的简单快速任务，Signal 会在完成后才显示，但这类任务通常耗时短（< 30 秒），影响有限

### 决策 5：取消后的终态使用 error 而非 expired

**选择**：为 `TURN_CANCELLED_BY_PARENT` 添加状态映射：`status: "error"`, `phase: "expired"`。保持现有错误码的映射逻辑完全不变。

**背景**：现有代码中，不同 `forceError` 错误码有不同的状态映射

**错误码映射**：

- `AGENT_PROCESS_INVALIDATED` → `status: "expired"`, `phase: "expired"` — 进程失效，资源不可用（现有）
- `APP_SHUTDOWN` → `status: "error"`, `phase: "interrupted"` — 应用关闭，任务中断（现有）
- `PARENT_SESSION_DELETED` → 保持原有映射逻辑（现有）
- `TURN_CANCELLED_BY_PARENT` → `status: "error"`, `phase: "expired"` — 父 Agent 主动取消（**新增**）

**理由**：

- `expired` 语义是"底层资源失效"（进程退出、升级），而主动取消是"用户意图终止"
- `error` 状态更符合"操作被中断"的语义
- 避免与 process invalidation 混淆，让 `check_session_status` 返回的描述更精准
- 只添加新错误码的映射，不修改任何现有路径

## Risks / Trade-offs

### Risk 1：background 默认值变更导致意外的异步行为

**影响**：现有未显式指定 `background` 的代码会从同步变为异步

**缓解措施**：

- 在 spec 中明确标记为 **BREAKING** 变更
- 在 tasks 中包含搜索现有调用点并评估影响的任务
- 提供清晰的迁移指导：需要同步行为时显式传递 `background: false`

### Risk 2：取消可能不立即生效

**影响**：`cancel_session` 返回 `cancelled: true` 后，turn 可能还需要几秒才真正终止

**缓解措施**：

- 在 tool description 中明确说明取消是异步的
- 建议 Agent 调用后通过 `check_session_status` 确认最终状态
- 复用现有的 5 秒 cancel grace period，保证不会无限卡住

### Risk 3：同步模式的 Signal 延迟影响可观测性

**影响**：使用 `background: false` 的同步任务，Signal 会在任务完成后才显示，用户看不到任务执行过程

**缓解措施**：

- 在 tool description 中明确说明同步模式的这一限制
- 强调异步模式（`background: true`，现在是默认）提供更好的可观测性
- 建议只在简单快速任务（< 30 秒）时才使用同步模式
- 文档说明：同步模式适用于"父 Agent 无其他工作、愿意阻塞等待"的场景

### Risk 4：取消未确认时的资源占用

**影响**：如果 `cancel_session` 调用后，ACP turn 在 5 秒 grace period 内未确认取消，可能继续占用并发槽位

**缓解措施**：

- 复用 `PARENT_SESSION_DELETED` 的模式：等待 `settledPromise` 或 5 秒超时
- 如果 5 秒内 turn settled，资源立即释放
- 如果 5 秒后仍未 settled，`cancelSession` 返回但 turn 继续运行直到自然终止
- `forceError` 已设置，最终状态仍为 `TURN_CANCELLED_BY_PARENT`
- `runner.completion` 最终会 resolve，触发资源释放逻辑（清理 active 计数、inactivity timer）
- 与现有 parent deletion 的处理逻辑保持一致

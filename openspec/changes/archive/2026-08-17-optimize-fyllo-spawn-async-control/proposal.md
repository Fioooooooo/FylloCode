## Why

当前 fyllo-spawn 工具在并发控制和可观测性方面存在三个改进机会：

1. **缺少主动取消能力**：父 Agent 无法主动取消已启动的 spawned session，只能被动等待超时或完成
2. **默认同步阻塞体验差**：`background` 参数默认 `false` 导致父 Agent 阻塞等待，用户无法观察到两个 Agent 的并行工作状态
3. **同步模式的 Signal 时机限制**：对于同步任务（`background: false`），Agent 在工具阻塞期间无法输出任何内容，`spawn.session` Signal 只能在任务完成后才显示。修改协议支持流式响应成本过高，投入产出比不合理。**决策：通过默认 `background: true` 和清晰文档引导，让绝大多数场景使用异步模式。少数使用同步模式的简单快速任务接受 Signal 延迟限制。**

这些问题影响了 spawned session 的控制灵活性和用户体验。

## What Changes

- **新增 `cancel_session` tool**：允许父 Agent 主动取消正在运行的 spawned session
  - 返回 `{ cancelled: true }` 表示取消请求已触发，不表示 ACP 已确认
  - 最终状态须通过 `check_session_status` 确认
  - 复用现有 `PARENT_SESSION_DELETED` 的模式：设置 `forceError` → 调用 `runner.cancel()` → 等待 `settledPromise` 或 5 秒超时
  - 5 秒后 `cancelSession` 返回，turn 继续运行直到自然终止，最终错误码为 `TURN_CANCELLED_BY_PARENT`
- **修改 `background` 参数默认值**：从 `false` 改为 `true`，鼓励异步使用模式
- **优化 `prompt_to_agent` 工具描述**：明确说明何时使用同步/异步模式，强调异步的可观测性优势，说明同步模式的 Signal 延迟限制
- **强化 Signal 输出规则**：在 `<fyllo-signal-contract>` 中明确异步模式应立即输出 Signal，同步模式接受延迟
- **修改取消后的状态持久化**：确保 `TURN_CANCELLED_BY_PARENT` 持久化为 `error` 而非 `expired`，让状态描述精准无歧义
- **明确错误码到状态的映射**：只修改新增的取消相关错误码，保持现有错误码（`AGENT_PROCESS_INVALIDATED`、`APP_SHUTDOWN`、`PARENT_SESSION_DELETED` 等）的映射逻辑不变

## Capabilities

### New Capabilities

- `fyllo-spawn-cancellation`：主动取消 spawned session 的能力

### Modified Capabilities

- `fyllo-spawn`：修改 `background` 参数默认值，优化工具描述引导异步使用

## Impact

**受影响组件**：

- `src/shared/types/fyllo-spawn-rpc.ts`：新增 `cancel_session` method 和 schema，添加 `TURN_CANCELLED_BY_PARENT` 错误码
- `src/mcp-servers/fyllo-spawn/src/tools/`：新增 `cancel-session.ts` tool，修改 `prompt-to-agent.ts` 的 default 和 description
- `src/main/services/session/spawn/spawned-session-manager.ts`：新增 `cancelSession` 方法，复用现有 `PARENT_SESSION_DELETED` 的 grace period 模式，修改 `forceError` 处理逻辑以添加 `TURN_CANCELLED_BY_PARENT` 的状态映射（保持其他现有错误码逻辑不变）
- Agent system prompt 中的 `<fyllo-signal-contract>`：优化 `spawn.session` Signal 规则，明确异步/同步的不同时机

**破坏性变更**：

- **BREAKING**: `background` 参数默认值从 `false` 改为 `true`
  - 现有依赖默认同步行为的代码需要显式传递 `background: false`
  - 影响范围：所有未显式指定 `background` 参数的 `prompt_to_agent` 调用

**向后兼容性**：

- `cancel_session` 是新增 tool，不影响现有代码
- 显式传递 `background` 参数的代码不受影响

## 1. 类型定义和 Schema

- [x] 1.1 在 `src/shared/types/fyllo-spawn-rpc.ts` 中的 `spawnMethodSchema` 枚举添加 `"cancel_session"`
- [x] 1.2 在同文件中定义 `cancelSessionParamsSchema = z.object({ sessionId: identitySchema }).strict()`
- [x] 1.3 在同文件中定义 `cancelSessionResultSchema = z.object({ cancelled: z.boolean(), reason: z.string().optional() }).strict()`
- [x] 1.4 在 `fylloSpawnRpcRequestSchema` discriminated union 中添加 `cancel_session` 分支，使用 `requestBaseSchema.extend({ method: z.literal("cancel_session"), params: cancelSessionParamsSchema })`
- [x] 1.5 导出相关类型：`CancelSessionParams`、`CancelSessionResult`
- [x] 1.6 修改 `promptToAgentParamsSchema` 中的 `background` 字段从 `z.boolean().default(false)` 改为 `z.boolean().default(true)`

## 2. MCP Server Tool 实现

- [x] 2.1 创建 `src/mcp-servers/fyllo-spawn/src/tools/cancel-session.ts`，实现 `registerCancelSessionTool` 函数
- [x] 2.2 Tool description 应说明：只能取消当前 owner 的 running session，`cancelled: true` 表示请求已触发（不表示已确认），取消是异步的，最终状态须通过 `check_session_status` 确认，取消后 session 进入 error 状态
- [x] 2.3 在 `src/mcp-servers/fyllo-spawn/src/tools/index.ts` 中导出 `registerCancelSessionTool`
- [x] 2.4 在 `src/mcp-servers/fyllo-spawn/src/server.ts` 中调用 `registerCancelSessionTool(server, rpc)`
- [x] 2.5 更新 `prompt-to-agent.ts` 的 tool description，在开头强调异步是推荐模式，提供轮询示例，说明同步模式的适用场景和 Signal 延迟限制

## 3. Main 进程取消逻辑

- [x] 3.1 在 `src/main/services/session/spawn/spawned-session-manager.ts` 中添加 `cancelSession(caller: SpawnCaller, sessionId: string): Promise<{ cancelled: boolean; reason?: string }>` 方法
- [x] 3.2 在 `cancelSession` 中首先调用 `requireParentSnapshot(caller)` 验证父 Session
- [x] 3.3 构造 `owner = { ...caller, sessionId }` 并从 `this.activeTurns.get(ownerKey(owner))` 获取 active turn
- [x] 3.4 如果 active turn 不存在，返回 `{ cancelled: false, reason: "Session not found" }`（不区分不存在、已终止或跨 owner）
- [x] 3.5 如果存在，设置 `active.forceError = { code: "TURN_CANCELLED_BY_PARENT", message: "Parent Agent cancelled this spawned session" }`
- [x] 3.6 调用 `active.runner?.cancel()` 触发取消
- [x] 3.7 等待 `Promise.race([active.settledPromise, this.delay(SPAWN_TURN_CANCEL_GRACE_MS)])` 完成（复用 `PARENT_SESSION_DELETED` 的模式）。仅等待，不在 race 超时时清理 active turn、覆盖 `forceError` 或写入其他错误码。5 秒后 `cancelSession` 返回，turn 继续运行直到自然 settled。
- [x] 3.8 无论 race 结果如何，都返回 `{ cancelled: true }`（表示取消请求已触发，不表示已确认完成）
- [x] 3.9 在 `src/shared/types/fyllo-spawn-rpc.ts` 的 `spawnTerminalErrorCodeSchema` 中添加 `"TURN_CANCELLED_BY_PARENT"`
- [x] 3.10 修改 `runTurn` 方法中的 `forceError` 处理逻辑（约 998-1024 行），为 `TURN_CANCELLED_BY_PARENT` 添加分支：`status: "error"`, `phase: "expired"`
- [x] 3.11 保持现有错误码映射不变：`AGENT_PROCESS_INVALIDATED` → `expired`，`APP_SHUTDOWN` → `error/interrupted`，`PARENT_SESSION_DELETED` 等保持原有逻辑
- [x] 3.12 确保 `check_session_status` 对于被取消的 session 返回 `status: "error"`、`code: "TURN_CANCELLED_BY_PARENT"`、精准的 message

## 4. RPC Bridge 集成

- [x] 4.1 在 `src/main/services/session/spawn/spawn-rpc-bridge.ts` 的 `handleSpawnRpc` 函数中添加 `case "cancel_session"` 分支
- [x] 4.2 该分支调用 `spawnedSessionManager.cancelSession(request.caller, request.params.sessionId)`
- [x] 4.3 使用 `cancelSessionResultSchema.parse()` 验证返回结果

## 5. Agent System Prompt 更新

- [x] 5.1 在 Agent system prompt 的 `<fyllo-signal-contract>` 中更新 `spawn.session` Signal 规则，明确异步模式（`background: true`）应在 `accepted` 返回后立即输出 Signal
- [x] 5.2 在 `spawn.session` 的 Constraints 中添加："Emit immediately after receiving an accepted result from background new session creation. For sync mode (background: false), emit after the tool completes."
- [x] 5.3 在 description 中说明同步模式的限制："Sync mode Signal appears after task completion due to blocking nature; use background mode for better observability"
- [x] 5.4 更新 executable output example，说明这是针对异步模式的推荐做法

## 6. 测试

- [x] 6.1 在 `test/main/services/session/spawn/spawned-session-manager.test.ts` 中添加 `cancelSession` 的单元测试，覆盖成功取消、session 不存在、跨 owner 尝试等场景
- [x] 6.2 验证 `background: true` 作为新默认值的行为，确保未显式指定时返回 accepted 而非 completed
- [x] 6.3 验证显式传递 `background: false` 时仍然保持同步行为
- [x] 6.4 验证被取消的 session 的 turn record 和 meta 包含正确的 `TURN_CANCELLED_BY_PARENT` 错误码和 `status: "error"`
- [x] 6.5 验证 `check_session_status` 对于被取消的 session 返回 `status: "error"` 而非 `expired`
- [x] 6.6 验证 `prompt_to_agent` 返回结果中的错误描述精准无歧义
- [x] 6.7 测试 grace period 内 settled 的场景：调用 `cancelSession`，模拟 turn 在 5 秒内完成，验证 `cancelSession` 在 turn settled 后返回 `{ cancelled: true }`，active turn、runner/session 资源按既有 completion 路径释放，最终状态为 `TURN_CANCELLED_BY_PARENT`
- [x] 6.8 测试 grace period 超时的场景：调用 `cancelSession`，模拟 turn 5 秒后仍未 settled，验证 `cancelSession` 及时返回 `{ cancelled: true }` 且 active turn 仍保留；随后模拟/等待 turn completion，验证资源最终释放，最终错误码仍为 `TURN_CANCELLED_BY_PARENT`（不是其他错误码）
- [x] 6.9 验证 `cancelSession` 的返回值语义：无论 race 结果如何（5 秒内 settled 或超时），都返回 `{ cancelled: true }`，该字段只表示"取消请求已触发"，不表示"已完成取消"
- [x] 6.10 验证现有 forceError 错误码（`AGENT_PROCESS_INVALIDATED`、`APP_SHUTDOWN`、`PARENT_SESSION_DELETED`）的状态映射保持不变

## 7. 影响评估和迁移

- [x] 7.1 搜索代码库中所有调用 `prompt_to_agent` 的位置（包括测试代码和 Agent prompt examples）
- [x] 7.2 评估哪些调用依赖默认同步行为，标记需要显式添加 `background: false` 的位置
- [x] 7.3 更新相关测试和示例代码，确保符合新的默认行为
- [x] 7.4 在项目文档或 CHANGELOG 中记录这个破坏性变更和迁移指导

## 8. 文档和提示优化

- [x] 8.1 确保 `prompt_to_agent` tool description 包含清晰的异步轮询示例代码（伪代码格式）
- [x] 8.2 在 tool description 中明确说明同步模式的限制：Signal 会在任务完成后才显示，适用于简单快速任务（< 30 秒）
- [x] 8.3 强调异步模式（默认）的优势：父 Agent 可以继续工作、用户可以观察进度、更好的可观测性
- [x] 8.4 确保 `cancel_session` tool description 包含参数说明、返回值说明和使用限制
- [x] 8.5 说明取消是"尽力而为"的，建议通过 `check_session_status` 确认最终状态
- [x] 8.6 在 system prompt 相关部分说明 spawned session 的推荐使用模式：异步启动 → 输出 Signal → 轮询状态 → 读取结果

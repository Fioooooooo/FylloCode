## 1. Stream 终态与取消边界

- [x] 1.1 在 `src/main/ipc/_kit/stream-channel.ts` 调整 `makeStreamChannel()` 的端口关闭处理：`sendDone()`/`sendError()` 已使 `StreamState.finalised=true` 时不得调用 `StreamRunner.cancel()`；renderer在终态前关闭时仍记录pending cancellation，并在异步`onReady()`返回runner前后都只取消一次。
- [x] 1.2 在 `test/main/ipc/_kit/stream-channel.spec.ts` 覆盖done自关闭、error自关闭、renderer提前关闭和runner延迟创建四类路径；验收标准是只有终态前的外部关闭调用cancel，正常终态保持零次cancel。

## 2. Production grant 到期策略

- [x] 2.1 在 `src/main/infra/mcp/mcp-access-grant-registry.ts` 以命名常量定义`2099-12-31T23:59:59.999Z`，让`McpAccessGrantRegistry.issue()`在未提供`ttlMs`时直接使用该production默认值，同时保留显式`ttlMs`按注入clock计算短期expiresAt的测试路径。
- [x] 2.2 更新 `test/main/infra/mcp/mcp-access-grant-registry.spec.ts`：断言默认grant的expiresAt固定为2099、签发一小时后仍可authorize，并保留显式短TTL过期后惰性删除及拒绝授权的覆盖；测试和日志不得暴露token或token hash。

## 3. ACP prompt cancel 与 activation invalidation

- [x] 3.1 在 `src/main/services/session/chat/acp-session.ts` 调整 `cancelResolvedAcpSession()`：已解析Session只幂等发送`connection.cancel({ sessionId })`，不得调用`forgetActiveAcpSession()`；保留`activateAcpSession()`在lifecycle绑定前取消或失败时通过现有finally撤销未绑定grant的行为。
- [x] 3.2 更新 `test/main/services/session/chat/acp-session.spec.ts` 与 `acp-stream-driver.spec.ts`，覆盖显式prompt cancel保留`activeSessionIds`和`mcpActivationBySessionId`、下一轮走direct prompt且不resume/重签，以及done/error终态不触发activation撤销。
- [x] 3.3 更新 `test/main/infra/process/acp-process-pool.spec.ts` 及必要的probe focused tests，锁定`forgetActiveAcpSession()`、`session/close`、activation replacement、probe丢弃、Agent process invalidation和host/app shutdown仍会幂等撤销对应grant，防止修复turn cancel时削弱真实生命周期清理。

## 4. 验证

- [x] 4.1 运行stream channel、ACP stream/session、probe、process pool、MCP grant与proxy相关Main focused Vitest测试，确认连续多轮、取消后续聊、默认2099过期时间和真实关闭撤销全部通过；不得启动`pnpm dev`或运行完整`pnpm build`。
- [x] 4.2 运行`pnpm typecheck`、`pnpm lint`、改动文件Prettier检查与`git diff --check`，并确认诊断日志只包含activation/session/reason/expiresAt，不包含明文token或token hash。

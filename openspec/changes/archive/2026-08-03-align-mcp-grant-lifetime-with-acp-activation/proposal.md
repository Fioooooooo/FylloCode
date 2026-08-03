## Why

当前 HTTP MCP capability token 使用签发后一小时的固定绝对有效期，但 ACP Agent 会在同一 Session 的多轮消息和长任务中持续复用最初收到的 MCP Authorization header，缺少热更新 token 的协议路径；同时，stream 正常终态和 `session/cancel` 被错误地当作 activation 关闭，导致仍在使用的 token 被提前撤销并返回 401。需要让 grant 生命周期与真实 MCP activation 对齐，避免健康连接因时间或 prompt turn 收尾而失效。

## What Changes

- 将 HTTP MCP grant 的 `expiresAt` 固定为 `2099-12-31T23:59:59.999Z`，保留现有过期字段、校验分支与测试注入能力，但不再让活跃 activation 因一小时硬 TTL 在长任务中失效。
- 明确 ACP `session/cancel` 只取消当前 prompt turn，不关闭 ACP Session，不撤销其已绑定的 MCP activation 或 token。
- 明确正常 `done`、terminal `error` 与其引发的 MessagePort 自关闭不得调用 runner cancel，也不得把 ACP Session 标记为 cold。
- 保留真实生命周期撤销：`session/close`、activation replacement、probe 丢弃、Agent process invalidation、bundled MCP host 停止以及应用退出仍立即幂等撤销 grant。
- 增加跨 stream、ACP Session 与 grant registry 的回归测试，保证连续多轮、显式取消、长任务模拟和真实关闭场景不会再次混淆。
- 不改变 token 明文隔离、hash-only registry、server allowlist、Workspace descriptor、HTTP proxy/backend 双层认证或 stdio fallback。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `mcp-workspace-authorization`: 将 HTTP grant 的时间边界调整为固定远期 `expiresAt`，并区分 prompt turn 的 done/error/cancel 与真正的 ACP activation 关闭、替换和进程失效。

## Impact

- Main stream lifecycle：`src/main/ipc/_kit/stream-channel.ts` 及其测试，确保终态关闭和 renderer 提前断开具有不同取消语义。
- ACP Session lifecycle：`src/main/services/session/chat/acp-session.ts`、`acp-stream-driver.ts`、`session-registry.ts` 及相关测试，拆分 prompt turn cancel 与 activation invalidation。
- MCP grant lifecycle：`src/main/infra/mcp/mcp-access-grant-registry.ts`、`acp-process-pool.ts` 及相关测试，固定远期到期时间并保留真实关闭时的撤销。
- OpenSpec：修改 `mcp-workspace-authorization` 的 capability 与 lifecycle requirements；不新增公共 API、IPC、schema、持久化格式或外部依赖。

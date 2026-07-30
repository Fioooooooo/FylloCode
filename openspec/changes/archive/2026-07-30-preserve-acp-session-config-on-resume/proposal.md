## Why

FylloCode 已将用户确认过的 ACP session `configOptions` 持久化到 session meta，但应用重启后的 cold recovery 只恢复 `acpSessionId`，随后又会用 Agent 在 `resumeSession`、`loadSession` 或 fresh `newSession` 中返回的默认值覆盖持久化选值。结果是 renderer 仍能加载旧配置，却无法保证首个续聊 prompt 实际使用相同的 model、mode、thought level 或其他 session 配置。

## What Changes

- 将 session meta 中最后一次由 Agent 确认的 `configOptions` 纳入 ACP session cold recovery，而不再只恢复 `acpSessionId` 与消息历史。
- 在冷连接的 direct prompt、`resumeSession`、`loadSession` 和 fresh `newSession` fallback 发送首个 prompt 前，按 Agent 当前返回的配置 schema 校验并重放仍受支持的持久化选值。
- 只有在 Agent 确认恢复结果后才用完整 live `configOptions` 更新 renderer 与 session meta，避免恢复响应中的默认值或缺失字段提前冲掉持久化期望值。
- 让应用重启后、首个 prompt 之前发生的 session 配置修改先恢复目标 ACP session，再调用 `session/set_config_option`。
- 对 Agent 升级后已删除的 option、变化的 type 或失效的 value 采用可诊断降级：不发送无效配置，记录结构化 warning，使用 Agent 当前值；其余仍兼容的选值继续恢复。对仍有效选值的重放 RPC 失败则中止首个 prompt，避免静默使用默认配置。
- 增加覆盖应用重启、resume/load/fresh fallback、cold direct prompt、冷会话配置修改、配置依赖变化与失败降级的 main/IPC/storage 回归测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `acp-agent-connection-lifecycle`: 扩展既有 ACP 会话恢复契约，使持久化 session 配置与 ACP session ID、消息历史一起跨进程重建和应用重启恢复，并定义 schema 变化时的降级行为。

## Impact

- Main session domain/service：`AcpSessionStore`、`AcpSession` recovery、config option reconcile helper、`config-option-service.ts`。
- Main IPC 与持久化：`src/main/ipc/session/chat.ts`、`ChatAcpSessionStore`、现有 session meta `configOptions` 读写；不新增 session meta 字段或迁移版本。
- Renderer：继续消费现有完整 `config_options_update` 与既有 stream error，不改变 Config Options Bar 的调用方式或新增 shared stream event。
- ACP 协议：复用现有 `session/resume`、`session/load`、`session/new` 与 `session/set_config_option`；不升级 `@agentclientprotocol/sdk`，不改变 shared IPC 请求形状。

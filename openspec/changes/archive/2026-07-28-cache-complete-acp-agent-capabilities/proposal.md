## Why

当前主进程只持久化 ACP Agent 的归一化 `promptCapabilities`，并在 `loadCapabilitiesCache` IPC 中再次裁剪为 prompt 能力，导致认证方式、MCP transport 能力、session 生命周期能力及 SDK `_meta` 扩展无法在冷启动后供 renderer 使用，也阻碍后续按 Agent 做个性化适配。

## What Changes

- 将 `agent-capabilities.json` 升级为可持久化每个 Agent 的完整能力快照，包含 SDK 原始 `authMethods`、`promptCapabilities`、`mcpCapabilities`、`sessionCapabilities`、版本和采集时间。
- 直接复用 `@agentclientprotocol/sdk` 导出的 `AuthMethod`、`PromptCapabilities`、`McpCapabilities` 与 `SessionCapabilities` 类型，保留 SDK 原始可选字段、marker object 与 `_meta` 扩展，不建立易漂移的镜像类型。
- 在 ACP `initialize` 成功后原样采集上述四类数据；缓存缺失、损坏或旧格式不得阻断 Agent 连接。
- 扩展现有 `platform:acp-agents:loadCapabilitiesCache` 与 `ensureAgent` 数据契约，避免 main IPC 裁剪字段，使 renderer 能获取完整能力快照。
- 让现有 renderer ACP Agent store 接收并保存完整快照，同时继续通过现有 prompt capability selector 向当前 UI 提供归一化能力，保持现有附件与 prompt 逻辑不变。
- 为既有 v1 prompt-only 缓存提供只读兼容：升级后首次读取返回 prompt-only partial snapshot，不立即改写磁盘；任一 Agent 后续成功 initialize 并提交缓存 mutation 时才写出 v2 envelope。该流程不引入 migration runner 或独立数据迁移。

## Capabilities

### New Capabilities

- `acp-agent-capability-cache`: 定义 ACP Agent 初始化能力的持久化格式、SDK 类型保真、兼容读取，以及通过 IPC 向 renderer 暴露完整能力快照的契约。

### Modified Capabilities

无。

## Impact

- 主进程持久化与采集：`src/main/infra/storage/agent-capability-store.ts`、`src/main/infra/process/acp-process-pool.ts`
- 主进程服务与 IPC：`src/main/services/platform/acp-agent/acp-agent-service.ts`、`src/main/ipc/platform/acp-agents.ts`
- shared/preload/renderer 契约：`src/shared/types/acp-agent.ts`、`src/preload/api/platform/acp-agents.ts`、`src/renderer/src/api/platform/acp-agents.ts`
- renderer 状态：`src/renderer/src/stores/platform/acp-agents.ts`
- 对应 main、IPC、preload 与 renderer store 测试
- 继续使用现有 `@agentclientprotocol/sdk` 依赖，不新增外部依赖

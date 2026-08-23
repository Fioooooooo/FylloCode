## Why

`fyllo-spawn` 当前固定把父 Chat Session 的完整 multi-root Workspace 传给 spawned Agent，导致不支持 ACP `additionalDirectories` 的 Agent（例如 OpenCode）在 Collection Workspace 中完全无法被驱动。首次创建 spawned Session 时允许父 Agent 显式选择一个已授权 Folder，可以在不扩大文件授权、不静默退化 scope 的前提下，让单根 Agent 承担 repository-local 任务，并让用户始终看清该 Session 实际使用的 Workspace 或 Folder。

## What Changes

- 为 `prompt_to_agent` 首次创建调用增加可选 `folderId`；省略时继续继承父 Session 的完整 Workspace，指定时只从父 Session 固定 snapshot 中选择该 Folder，并以它作为 `cwd`、以空 `additionalDirectories` 创建 Session。
- 明确 `folderId` 只能在省略 `sessionId` 的新建调用中使用；续聊固定复用已持久化 scope，不能切换 Folder。字段 description、tool description 与相关错误都要给 Agent 可执行的恢复步骤。
- 当目标 Agent 不支持完整 multi-root Workspace 时，保留 `PROMPT_CAPABILITY_MISMATCH`，但返回“未创建 Session”、可选 Folder ID/名称、重试调用方式，以及任务确需多 Folder 时更换 Agent 的说明；禁止自动回退到 primary Folder。
- 在 spawned Session meta 中持久化显式的 `workspace | folder` scope 及稳定展示信息；旧记录归一化为 `workspace`，无需离线迁移。
- 将 scope 投影到 spawned Session list/detail 查询契约，并在详情 Slideover 中展示 `Workspace · <名称>` 或 `Folder · <名称>`，包括历史、错误与过期 Session。
- 不接受 caller 提交的绝对 `cwd`，不改变父 Session ownership、Folder allowlist、并发、后台执行、响应读取或 continuation identity 契约。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `fyllo-spawn`: 修改 `prompt_to_agent` 输入、spawned Session Workspace 继承、持久化查询和用户可观察性要求，增加显式单 Folder scope。
- `acp-agent-capability-cache`: 保持禁止隐式 primary-only 降级，同时允许调用方显式选择父 Session 授权 snapshot 中的单个 Folder 后启动不支持 `additionalDirectories` 的 Agent。
- `spawned-session-inspection`: 在 owner-scoped list/detail 投影与 Turn-aware Slideover 中提供持久化的 Workspace/Folder scope 展示。

## Impact

- 共享 MCP/RPC 与 renderer 查询契约：`src/shared/types/fyllo-spawn-rpc.ts`、`src/shared/ipc/session/spawned-session.schemas.ts`。
- Main Session service 与持久化：`src/main/services/session/spawn/spawned-session-manager.ts`、`spawned-session-query-service.ts`、`src/main/infra/storage/spawned-session-store.ts`，并复用既有 Workspace resolver 与 compatibility gate。
- MCP tool 文案与 server 文档：`src/mcp-servers/fyllo-spawn/src/tools/prompt-to-agent.ts`、README、CHANGELOG 与 server version。
- Renderer spawned-session-inspector：详情 Slideover 的 Session 级 scope 展示及对应投影/测试。
- OpenSpec 契约与测试：`fyllo-spawn`、`acp-agent-capability-cache`，以及 shared schema、Main manager/storage/query、MCP tool、renderer UI 的 focused tests。

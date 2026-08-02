## Why

ACP Chat 已能以固定 Session snapshot 获得 multi-root 文件访问，但 bundled MCP 仍通过应用级 bearer token 与调用方可写的单项目 path headers/env 决定工具作用域；这既无法表达多个 Folder，也允许 Agent 伪造请求上下文。进入 ProposalRef 和跨仓库工具语义之前，需要先把 MCP 的信任边界升级为由 Main 签发、按 activation 固定的 Workspace v2 授权。

## What Changes

- 引入版本化 `McpWorkspaceDescriptorV2`，把 Workspace identity、primary、按序 Folder 授权、Workspace-owned data/event 目录和可选 Session identity 固定为一次 activation 的不可变上下文。
- 在 Main 维护内存 capability grant registry：每次 probe/new/load/resume activation 签发不透明短期 token，只保存 token hash，并绑定 descriptor、允许访问的 bundled server、签发时间与过期时间；Session 关闭、取消、替换、进程失效或 host 停止时撤销 grant。
- 将 HTTP 信任边界拆为 Agent 到 Main proxy 的 activation token，以及 proxy 到 bundled backend 的应用内部 token。proxy 验证 grant/server scope，移除调用方全部 `X-Fyllo-*` 上下文头，再注入由 grant 派生的可信 Workspace v2 context。
- 保持应用级 HTTP backend 与稳定 proxy URL，但让每个请求只从 Main 注入的 Workspace v2 context 建立独立 `AsyncLocalStorage` 上下文。
- 对不支持 HTTP 的 Agent，为每次 activation 生成独立 stdio MCP spec，并仅通过 `FYLLO_WORKSPACE_JSON` 投影同一 descriptor；stdio 明确依赖进程隔离，而不宣称具备 HTTP token 的对抗式安全边界。
- 在 shared MCP runtime 提供统一 Workspace/Folder/worktree resolver，所有 bundled tools 按稳定 `workspaceId/folderId` 解析路径，并拒绝 descriptor 外 Folder、未注册 worktree 与任意路径逃逸。
- Chat/probe descriptor 从已验证的 `SessionWorkspaceSnapshot` 派生；proposal apply/archive 保持 owner-only descriptor，不因来源 Workspace 为 multi-root 而暴露其他 Folder。
- 扩展 MCP proposal/plan events，携带 `workspaceId` 与 owner `folderId`，使 Main 不再从 repository path 反推归属。
- **BREAKING**：删除 Agent 可见的应用共享 HTTP token、`X-Fyllo-Project-*`/`X-Fyllo-Mcp-Event-Dir`/`X-Fyllo-Session-Id` 上下文头、`FYLLO_PROJECT_*`/`FYLLO_MCP_EVENT_DIR`/`FYLLO_SESSION_ID` stdio fallback，以及 shared `getProjectPath()` 单根入口；bundled MCP 调用方必须迁移到 Workspace v2 context/resolver。

## Capabilities

### New Capabilities

- `mcp-workspace-authorization`: 定义 Workspace v2 descriptor、activation capability grant、shared resolver、stdio 隔离及 MCP event owner identity 的安全契约。

### Modified Capabilities

- `bundled-mcp-http-transport`: 将 Agent 直持应用共享 token 和自报 path headers 改为 Main proxy 验证 activation grant、注入可信 Workspace context，并更新 stdio fallback 契约。
- `acp-multi-root-session`: 规定 Chat/probe 从固定 Session snapshot 派生 MCP descriptor，并确保 apply/archive 的 MCP scope 同样保持 owner-only。

## Impact

- Main：`src/main/infra/mcp/**` 的 host、registry 与 spec 生成，`src/main/infra/process/acp-process-pool.ts` 的 session 生命周期，以及 `src/main/services/session/chat/**` 的 probe、activation、recovery 与 descriptor 投影。
- Shared/runtime：新增跨进程 Workspace v2 类型与校验，替换 `src/mcp-servers/shared/request-context.ts`、`env.ts` 和 `http-server.ts` 的单项目上下文。
- Bundled servers：`fyllo-specs`、`fyllo-cortex` 的 project-root、data/event/session getter、工具调用点、说明文档和测试迁移到 resolver。
- Lineage：`src/shared/types/mcp-event.ts`、事件写入与 `mcp-event-consumer` 改用 `workspaceId/folderId`。
- 测试与指南：更新 Main/MCP/session/lineage 的 focused Vitest 覆盖及 `guidelines/MainProcess.md`；不引入新的外部依赖。

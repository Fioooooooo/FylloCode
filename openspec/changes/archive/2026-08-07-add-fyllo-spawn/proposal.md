## Why

FylloCode 当前只能让聊天 Agent 使用自身实现提供的同类型子 Agent，无法把任务委派给用户已经安装的另一种 ACP Agent。需要新增一个受当前 Workspace 与父 Session 授权约束的 `fyllo-spawn` bundled MCP server，在不复制现有 ACP、存储和生命周期基础设施的前提下提供跨 Agent 类型委派能力。

## What Changes

- 新增 HTTP-only bundled MCP server `fyllo-spawn`，提供 `available_agents`、`prompt_to_agent`、`check_session_status` 和 `read_response` tools；不支持 HTTP MCP 的 Agent 或 fyllo-spawn backend 不可用时不注入该 server，既有 fyllo-specs/fyllo-cortex 继续保留 HTTP 到 stdio fallback。
- 复用 Main HTTP proxy 注入的 `McpWorkspaceDescriptorV2`，从可信请求上下文取得 `workspaceId` 与父 `fylloSessionId`；tool 参数不得自报或覆盖调用方身份，所有续聊、状态和响应读取都校验 spawned Session 归属。
- 扩展现有 bundled MCP child IPC channel 为带版本、request ID、结构化成功/失败结果、取消和断连清理的内部 RPC；Main 通过 service 注册的 handler 调用 SpawnedSessionManager，保持 `infra` 不依赖 `services`。
- 复用现有 ACP process pool、`AcpSession`/activation、config option、Workspace snapshot 校验、MessageAssembler、session registry 与 shutdown orchestration；spawned ACP Session 不建立新的进程池，也不重复实现 ACP notification 映射。
- 让 spawned Session 继承并固定父 Chat Session 的 multi-root `SessionWorkspaceSnapshot`，使用其 `cwd`/`additionalDirectories`，并把消息、meta 与不可变 turn response 持久化到 Workspace-owned 父 Session 子目录。
- Phase 1 使用同步 prompt：同一 spawned Session 同时只允许一个 active turn；单父 Session 最多 4 个、全应用最多 8 个并行 spawned turns，达到上限立即返回可重试容量错误，不限制累计 Session 数量或使用时长。
- 为 active turn 增加 10 分钟无 ACP activity watchdog；超时后调用 ACP `session/cancel` 并等待 5 秒，取消未确认的 Session 进入不可续用 error 状态，不终止共享 AgentProcess。
- 小响应直接随 `prompt_to_agent` 返回；大响应返回有界前缀、`responseId` 与 cursor，由 `read_response` 按 owner 校验后分段读取，不把 app-data 绝对路径作为 Agent 必须可访问的公开接口。
- 持久化主 Agent 发送给子 Agent 的 `role=user` prompt 和子 Agent assistant 消息；父 Session 删除时先建立写入 fence、取消关联 turns，再清理整个 Session 子目录，迟到事件不得重建已删除数据。
- Phase 1 明确沿用现有 ACP connection 的 `allow_once` 权限策略；不向 spawned ACP Session 注入 FylloCode system reminder、bundled MCP server、background 模式、fyllo-signal 或专用 renderer UI。

## Capabilities

### New Capabilities

- `fyllo-spawn`: 定义跨 ACP Agent 委派的 tool API、可信调用方作用域、spawned Session 生命周期、multi-root 授权、并发与超时、持久化、响应读取及故障语义。

### Modified Capabilities

- `bundled-mcp-http-transport`: 为 bundled MCP registry 增加 server 级 transport policy，使 fyllo-spawn 可声明为 HTTP-only，并在 Agent 不支持 HTTP或 backend 不可用时省略，而不是生成不可工作的 stdio fallback。

## Impact

- MCP server 与构建：新增 `src/mcp-servers/fyllo-spawn/**`，更新 `scripts/build-mcp-servers.mjs`、bundled MCP registry、HTTP host child IPC 与 child lifecycle tests。
- Main services：在 `src/main/services/session/` 下新增 spawned Session 编排与存储 adapter，并小幅扩展现有 `AcpSession` runtime owner、通用 turn driver、session registry 和 process invalidation wiring。
- Main infra/shared：新增 typed fyllo-spawn RPC contract、Workspace-owned spawned path/store、HTTP-only registry policy与 owner-safe response reader；不新增生产依赖或第二套 Agent process pool。
- 生命周期：把 spawned turns 的 quiesce/cancel/fence 接入现有 `SHUTDOWN_PHASES`，并扩展父 Chat Session 删除流程。
- 测试与规范：新增 MCP tool、RPC、并发、timeout、multi-root、owner isolation、持久化、删除与 shutdown 覆盖；同步更新 `guidelines/MainProcess.md` 中 bundled MCP server 与 spawned Session 复用边界。

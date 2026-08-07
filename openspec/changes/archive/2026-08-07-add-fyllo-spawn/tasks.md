## 1. 共享契约与 bundled MCP 注册

- [x] 1.1 在 `src/shared/types/fyllo-spawn-rpc.ts` 定义并导出 versioned RPC envelope、`SpawnCaller`、四个 method 的 params/result、稳定错误码与运行状态 schema；补充 `test/shared/types/fyllo-spawn-rpc.spec.ts`，覆盖非法 version/kind、重复或缺失 identity、cursor/size 边界。验收：MCP child 与 Main 只依赖同一组可判别 union，不各自维护平行 DTO。
- [x] 1.2 扩展 `src/main/infra/mcp/bundled-mcp-registry.ts#BundledMcpServerRegistration`，加入默认 `http-or-stdio` 与显式 `http-only` transport policy，并注册 `fyllo-spawn`；同步 `scripts/build-mcp-servers.mjs` 和相关 registry/build 测试。验收：fyllo-specs、fyllo-cortex 行为不变，fyllo-spawn 被构建且只声明 HTTP transport。
- [x] 1.3 修改 `src/main/infra/mcp/bundled-mcp-servers.ts#createBundledMcpActivation`，按单 server policy 独立产生 HTTP、stdio 或 omit 结果；扩展 `test/main/infra/mcp/bundled-mcp-servers.test.ts`。验收：HTTP 不可用时 fyllo-spawn 被省略，其他 server 仍可 stdio fallback，grant allowlist 只包含实际注入的 HTTP servers。

## 2. fyllo-spawn child 与 Main RPC transport

- [x] 2.1 新增 `src/mcp-servers/fyllo-spawn/src/index.ts`、`server.ts`、`rpc-client.ts` 与 `tools/*.ts`，复用 `src/mcp-servers/shared/workspace-context.ts#getWorkspaceContext` 取得可信 caller，注册 `available_agents`、`prompt_to_agent`、`check_session_status`、`read_response`。验收：tool input 不含 workspaceId/parentSessionId/path，缺少可信 session context 返回 `SPAWN_PARENT_SESSION_REQUIRED`，父 IPC disconnect 会 abort HTTP listener 和所有 pending RPC。
- [x] 2.2 在 `src/main/infra/mcp/bundled-mcp-host.ts` 增加 `registerBundledMcpRpcHandler(serverName, handler)` transport port，并在现有 managed child IPC channel 上实现 request/cancel/response 路由、requestId 去重、child generation fencing 与 disconnect rejection；不得 import `services/`。扩展 `test/main/infra/mcp/bundled-mcp-host.spec.ts` 覆盖并发、取消、重启、旧世代迟到 response 和 malformed envelope。验收：多个并行 tool call 可独立结算，旧 child 不能收到或完成新 generation 的 RPC。
- [x] 2.3 新增 `src/main/services/session/spawn/spawn-rpc-bridge.ts`，把 transport RPC 映射到单例 `SpawnedSessionManager`，并在 `src/main/bootstrap/runtime.ts` 显式注册、注销；不得通过 import side effect 建立连接。验收：services 依赖 infra port，infra 不反向依赖 services，runtime shutdown 后新 RPC 被一致拒绝。

## 3. 复用 ACP session 与事件驱动主干

- [x] 3.1 扩展 `src/main/services/session/chat/acp-session.ts#AcpSession`、`acp-session-activation.ts#activateAcpSession` 和 `session-runtime-profile.ts`，加入显式 spawn owner/profile，复用 `getOrStartProcess`、config set/recovery、cancel 和 process generation；spawn profile 固定使用空 bundled MCP 与空 system reminder。扩展既有 ACP session/activation 测试。验收：spawn 不伪装成 chat/native，不新建第二套 process pool 或 ACP connection 封装，权限仍走现有 `allow_once`。
- [x] 3.2 从 `src/main/services/session/chat/acp-stream-driver.ts#driveAcpStream` 抽取 renderer 无关的 `driveAcpTurn`，让现有 chat/apply/archive adapter 与 spawn manager 共用 SessionEvent、`MessageAssembler` 和 terminal cleanup 主干；同步 `src/main/services/session/_public/index.ts` 与 `test/main/services/session/chat/acp-stream-driver.spec.ts`。验收：现有 stream chunk/terminal 行为回归通过，spawn 没有复制 event-kind switch。
- [x] 3.3 扩展 `src/main/services/session/chat/session-registry.ts` 的 owner/key 与按父 Session取消能力，并扩展 `src/main/infra/process/acp-process-pool.ts#onAgentProcessInvalidated`，保证 AgentProcess 任意退出或 generation 变化时立即发出失效事件；补充对应单元测试。验收：删除父 Session、shutdown 和 process exit 都能取消或失效关联 turns，自动重启不会继承旧 ACP Session。

## 4. Workspace-owned 持久化与响应分段

- [x] 4.1 在 `src/main/infra/storage/workspace-paths.ts` 增加 spawn 根目录、Session目录、meta/messages/response path helpers，全部复用 `assertStorageIdentity`；新增 `src/main/infra/storage/spawned-session-store.ts` 实现 versioned meta 原子替换、per-session 写队列、JSONL append、不可变 response 写入和 deletion fence。补充 `test/main/infra/storage/workspace-paths.spec.ts` 与 `spawned-session-store.spec.ts`。验收：任何 caller 值都不能逃逸 Workspace data root，response 不可覆盖，删除或 shutdown fence 后迟到写入不能重建目录。
- [x] 4.2 在 spawned store 中实现 UTF-8 安全的 24 KiB inline 前缀与默认 24 KiB/最大 64 KiB chunk reader，cursor 使用 server 生成的 base64url opaque offset；补充多字节字符、边界、非法 cursor、未知 response 与 EOF 测试。验收：完整内容只保存在 server-owned 文件中，tool 结果不暴露 `responsePath` 或接受任意 path。
- [x] 4.3 每轮在 ACP prompt 前持久化主 Agent发送的 `role=user` UIMessage，在 terminal path 持久化统一 assembler 产生的 assistant UIMessage、response Markdown、usage/config/error 与 meta；覆盖成功、部分输出后失败、持久化失败的测试。验收：messages.jsonl 顺序稳定，responseId/turnId 不复用，error 状态不伪报 idle。

## 5. SpawnedSessionManager 行为

- [x] 5.1 新增 `src/main/services/session/spawn/spawned-session-manager.ts` 与 owner-qualified live entry，复用 `chat-service`/`session-workspace-service.ts#assertSessionWorkspaceSnapshotCurrent`、`agent-workspace-compatibility.ts#assertAgentWorkspaceCompatibility`、`agent-catalog.ts#listAgents` 和 installed records。验收：父 Session不存在或 snapshot stale 时不启动 Agent，multi-root cwd/additionalDirectories 固定继承父 snapshot，跨 owner 查询统一返回 not_found。
- [x] 5.2 实现 `available_agents` 和 `prompt_to_agent` 的新建/续聊/config 流程：目录查询不启动进程；新建使用 `newSession().configOptions`，override 在 prompt 前走现有 set-option；续聊校验当前 ready process generation 与 `hasActiveAcpSession`。验收：config warnings逐项返回，同类型 Agent可列出，spawned child不注入 fyllo-spawn，失效 ACP Session返回 expired而不调用 `getOrStartProcess` 恢复。
- [x] 5.3 在第一个异步边界前原子占用 active turn，执行“单 spawned Session 1、单父 Session 4、全局 8”的瞬时并发计数，超限返回 retryable `SPAWN_CAPACITY_EXCEEDED`且不排队；实现每父 Session 32 个 idle resident entries 软目标的 LRU 卸载。用可控并发测试覆盖 busy、父/全局上限、失败释放计数与累计 Session不受限。验收：只限制 active turns，不设置累计或绝对运行时长上限。
- [x] 5.4 实现可注入 clock/timer 的 activity watchdog：匹配 Session的文本、reasoning、tool、usage等事件重置10分钟 timer；超时调用 `AcpSession.cancel()`并等待5秒 grace，分别返回 `TURN_INACTIVITY_TIMEOUT` 或 `TURN_CANCEL_UNCONFIRMED`。验收：持续有活动的长 turn不被取消，所有正常/错误/调用方取消/父删除/process invalidation/shutdown path 都清理并 `unref()` timer 与容量计数，迟到事件被 turn fence 丢弃。
- [x] 5.5 实现 `check_session_status` 的 `not_found | running | idle | error | expired` 快照与最多3条 recentActivity，以及 owner-safe `read_response`。验收：状态查询可与运行中 prompt并行且不等待其完成，response读取每块都重验 owner/response/cursor，跨 owner不泄露存在性。

## 6. 删除与集中生命周期

- [x] 6.1 在 `src/main/services/session/chat/chat-service.ts#removeSession` 与 store 删除边界接入 parent deletion fence：先拒绝新 spawn、取消关联 turns、最多等待5秒，再删除 `sessionDir(workspaceId, sessionId)` 下的 spawn数据并完成现有 meta/messages/attachments清理；补充 `chat-service.spec.ts`、`session-store.spec.ts` 与竞态测试。验收：删除过程中没有新 turn或写入成功，超时后仍完成删除，迟到 ACP event不重建目录。
- [x] 6.2 将 spawned manager 的 `beginShutdown`、`dispose`、`forceDispose` 接入 `src/main/bootstrap/shutdown.ts#SHUTDOWN_PHASES` 与 `runtime.ts#configureShutdownRuntimeResources`，保证 quiesce先 fence/cancel、ACP process pool terminate前结算、bundled host继续在既有 terminate阶段退出；更新 `test/main/bootstrap/shutdown.spec.ts` 和 `src/main/bootstrap/README.md`。验收：清理复用现有应用级4秒 deadline，不额外启动新 deadline或 AgentProcess，重复 shutdown幂等。

## 7. 端到端覆盖、文档与质量门禁

- [x] 7.1 在 `test/mcp-servers/fyllo-spawn/` 覆盖四个 tool 的 schema、可信 context、RPC abort、inline/chunk提示和错误映射；在 main service 集成测试覆盖两个父 Session并行、同父并行、multi-root、backend重启、process失效、父删除与长期顺序创建。验收：测试能证明 status可观测、容量只看 active turns，且 HTTP-only server从不退化为 stdio。
- [x] 7.2 更新 `guidelines/MainProcess.md`，记录 fyllo-spawn service/infra边界、bundled MCP transport policy、typed child RPC与 shutdown ownership；只在仓库事实确有变化时同步其他直接受影响说明。验收：guideline不再把所有 bundled MCP描述为无条件 stdio fallback，且明确禁止 infra import services和复制 ACP runtime。
- [x] 7.3 运行针对性 Vitest（shared、bundled MCP host/activation、ACP session/driver/process pool、spawn store/manager、chat deletion、shutdown），然后运行 `pnpm typecheck`、`pnpm lint` 与 `pnpm test`。验收：所有命令通过；若需运行 `pnpm build`，先取得用户明确批准并单独记录结果。

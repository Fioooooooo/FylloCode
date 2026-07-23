## 1. 请求上下文与 transport 基础类型

- [x] 1.1 在 `src/shared/types/mcp.ts` 将 `McpServerSpec` 改为 `McpServerSpecStdio | McpServerSpecHttp` 判别联合，保留 stdio command/args/env 字段，并为 HTTP spec 增加稳定 URL 与 header record；更新引用该类型的测试/调用点，使 TypeScript 能穷尽判别两种 transport。
- [x] 1.2 新增 `src/mcp-servers/shared/request-context.ts`，实现 `RequestContext`、base64url/UTF-8 header 解码、必填 `projectPath`/`projectDataDir` 校验、可选 `mcpEventDir`/`sessionId` 和 `AsyncLocalStorage` 执行入口；在 `test/mcp-servers/shared/request-context.spec.ts` 覆盖中文路径、非法编码、缺失必填字段及两个并发项目不串线。
- [x] 1.3 新增 `src/mcp-servers/shared/env.ts`，实现 `getProjectPath()`、`getProjectDataDir()`、`getMcpEventDir()`、`getSessionId()` 等统一 getter：HTTP request context 优先、stdio 环境变量回退；测试两种模式并确认模块不修改 `process.env`。
- [x] 1.4 全量迁移 `src/mcp-servers/fyllo-specs/src/tools/**`、`src/mcp-servers/fyllo-specs/src/utils/**`、`src/mcp-servers/fyllo-specs/src/runtime-*/**`、`src/mcp-servers/fyllo-cortex/src/tools/**` 与 `src/mcp-servers/fyllo-cortex/src/utils/**` 中对 `FYLLO_PROJECT_PATH`、`FYLLO_PROJECT_DATA_DIR`、`FYLLO_MCP_EVENT_DIR`、`FYLLO_SESSION_ID` 的直接读取到 shared env getter；保持 `FYLLO_OPENSPEC_CLI_PATH` 等进程级固定配置不变，并更新现有 MCP tool/runtime 测试验证存储路径和 tool 结果兼容。

## 2. Bundled MCP server 双模式

- [x] 2.1 在 `src/mcp-servers/shared/http-server.ts` 实现共享 HTTP 启动器：缺少 `FYLLO_MCP_AUTH_TOKEN` 时拒绝监听，错误 bearer token 返回 401，context 格式错误返回 400，合法请求进入 `AsyncLocalStorage`；listener 仅绑定 `127.0.0.1:0` 并通过 `process.send({ type: "ready", port })` 报告端口。
- [x] 2.2 在共享 HTTP handler 中为每个请求调用 server factory，创建独立 `McpServer + StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`，响应/异常结束后关闭实例；在 `test/mcp-servers/shared/http-server.spec.ts` 覆盖 initialize、tools/list、tools/call、串行/并发请求和请求完成清理，确认不出现重复 connect 或 request id 串线。
- [x] 2.3 将 `src/mcp-servers/fyllo-specs/src/server.ts` 与 `src/mcp-servers/fyllo-cortex/src/server.ts` 拆为 `createMcpServer()` factory 和 transport 启动分支；stdio 使用单实例 `StdioServerTransport`，`FYLLO_MCP_TRANSPORT=http` 使用 shared HTTP 启动器，`src/mcp-servers/*/src/index.ts` 继续通过 AbortController 处理 SIGTERM/SIGINT。
- [x] 2.4 扩展 `test/mcp-servers/fyllo-specs/tools.test.ts` 与 `test/mcp-servers/fyllo-cortex/tools.test.ts`（或新增对应 server transport spec），验证两个 bundled server 在 stdio/HTTP context 下注册相同 tools、产生相同业务结果，并确认每次 HTTP 请求只创建内存对象而不 spawn 新进程。

## 3. 主进程 HTTP host、代理与恢复

- [x] 3.1 新增 `src/main/infra/mcp/bundled-mcp-host.ts`，实现 `startBundledMcpHost()`、`waitForBundledMcpInitialReadiness()`、`getMcpServerEndpoint()`、`stopBundledMcpHost()` 与 `ManagedMcpServer` 状态；生成一次 32-byte base64url token，使用 `cross-spawn` 和 `stdio: ["ignore", "pipe", "pipe", "ipc"]` 并行启动注册的后端，持续 drain stdout/stderr 且不记录 token/env。
- [x] 3.2 在 host 中使用 Node `http.createServer()` 实现稳定 loopback proxy：监听随机端口，只接受 `/mcp/fyllo-specs` 与 `/mcp/fyllo-cortex`，按 `name -> backendPort` 将目标改写为 `/mcp` 并用 `http.request()` 流式转发；透传 MCP/Auth/`X-Fyllo-*` headers、移除 hop-by-hop headers，未知路径返回 404，后端 unavailable 返回 503 + `Retry-After`。
- [x] 3.3 实现 child ready/exit 映射生命周期：只接受匹配当前 child 的 `{ type: "ready", port }`，ready 时原子更新端口，exit/error 时先清空端口；使用集中常量实现有限指数退避和最大重启次数，重启期间保持 proxy port/token 不变，达到上限后进入 `failed`。
- [x] 3.4 实现唯一首次 startup promise 与 `INITIAL_BACKEND_READY_TIMEOUT_MS = 3000`：所有后端并行结算 ready/timeout，token/proxy 失败被吸收为 host unavailable，所有 probe/chat waiter 共享 promise且不重复 spawn；`FYLLO_DISABLE_BUNDLED_MCP=1` 时不创建 token、proxy 或子进程并立即结算。
- [x] 3.5 实现幂等 `stopBundledMcpHost()`：先禁止重启并停止 proxy 接收请求，再清理 ready/restart timers、SIGTERM 后端、对超时进程复用 `src/main/infra/process/acp-process-pool.ts` 的平台进程树终止模式，最后清空 port/process/token/promise 引用。
- [x] 3.6 新增 `test/main/infra/mcp/bundled-mcp-host.spec.ts`，以 mock child、fake timers 和真实 loopback test server 覆盖随机 proxy 端口稳定性、两条 path 的端口映射、后端重启换端口、header/stream 转发、404/503、并行 readiness、有限退避、禁用模式及幂等 shutdown。

## 4. ACP spec 分流与启动时序

- [x] 4.1 重构 `src/main/infra/mcp/bundled-mcp-servers.ts`：保留 dev/packaged bundle 解析，将 registration `env` 重命名为 `processEnv`，实现异步 `resolveBundledMcpServers()` 与集中 `toAcpMcpServer()`；HTTP spec 使用稳定 proxy URL、bearer token 和 base64url `X-Fyllo-*` context headers，单个 backend unavailable 时只对该 server 生成现有 stdio fallback。
- [x] 4.2 更新 `test/main/infra/mcp/bundled-mcp-servers.test.ts`，覆盖 agent HTTP capability、HTTP/stdio 混合 spec、中文 header 往返、dev/packaged stdio fallback、session id 可选、host failure、单后端 unavailable 及 `FYLLO_DISABLE_BUNDLED_MCP=1` 空列表。
- [x] 4.3 修改 `src/main/services/session/chat/acp-session.ts` 的 `prepareStartContext()`：从 `entry.initializeResponse.agentCapabilities.mcpCapabilities.http` 获取能力，`await resolveBundledMcpServers()` 后经 `toAcpMcpServer()` 传入 ACP `newSession`；更新 `test/main/services/session/chat/acp-session.spec.ts` 验证 readiness 在 `newSession` 前完成且 resume/load 现有行为不变。
- [x] 4.4 修改 `src/main/services/session/chat/session-probe-service.ts` 的 `ensureProbe()` 使用同一异步 resolver，同时保持 pending probe handler 在 `newSession` 前注册和按 agent 串行化规则；更新 `test/main/services/session/chat/session-probe-service.spec.ts`，验证 probe/chat 并发共享 readiness 且 probe notification 顺序不回归。
- [x] 4.5 修改 `src/main/bootstrap/index.ts`：migrations 后调用 `startBundledMcpHost()` 并立即注册 lifecycle disposable，不等待后端 ready 即继续 `registerAllHandlers()`、broadcast setup 与 `openLauncherWindow()`；新增或扩展 bootstrap 测试，证明慢/失败 MCP startup 不阻塞 window 创建，且退出会调用 host stop。

## 5. 文档与质量验证

- [x] 5.1 更新 `src/mcp-servers/fyllo-specs/README.md`、`src/mcp-servers/fyllo-cortex/README.md`（若不存在则补充对应 transport 小节），记录 `FYLLO_MCP_TRANSPORT`、`FYLLO_MCP_AUTH_TOKEN`、HTTP context headers、stdio fallback 与请求级实例模型；不得把延期的签名/token 绑定描述为本期能力。
- [x] 5.2 更新 `guidelines/MainProcess.md` 的 bundled MCP 约定，明确 `src/main/infra/mcp/bundled-mcp-host.ts` 拥有 proxy/child/restart/lifecycle，`src/mcp-servers/**` 不依赖 Electron/@main，renderer 启动不等待 MCP readiness，ACP session 只能通过集中 resolver 获取 transport spec。
- [x] 5.3 运行 MCP shared、两个 bundled server、`bundled-mcp-host`、`bundled-mcp-servers`、`acp-session` 和 `session-probe-service` 的定向 Vitest；随后运行 `pnpm typecheck`、`pnpm lint` 与 `pnpm test`，修复所有本变更引入的失败。若需要执行完整应用构建或 packaged smoke test，须先获得用户明确同意。
- [x] 5.4 为 bundled MCP host 增加 proxy ready、子进程 spawn、后端 ready 日志，输出稳定 proxy URL 与每个后端 URL，并以测试确认共享 token 不会写入日志。
- [x] 5.5 让两个 bundled MCP 子进程在父进程 IPC `disconnect` 时触发 `AbortController.abort()`，关闭 transport/listener，并以入口测试覆盖两个 server。
- [x] 5.6 将父进程 IPC disconnect 作为所有当前和未来 bundled MCP HTTP 子进程的生命周期租约写入本次新增 spec，并在 `guidelines/MainProcess.md` 固化入口实现与测试约束。

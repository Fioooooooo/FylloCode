## Context

当前 `src/main/infra/mcp/bundled-mcp-servers.ts` 只生成 stdio MCP spec。`AcpSession.prepareStartContext()` 和 `session-probe-service.ensureProbe()` 将这些 spec 传入 ACP `newSession()`，实际 MCP 进程的创建与复用由各 ACP agent 决定。现状会随 agent/session 数量产生重复的 bundled MCP 进程。

两个 bundled server（`fyllo-specs`、`fyllo-cortex`）依赖 `FYLLO_PROJECT_PATH`、`FYLLO_PROJECT_DATA_DIR`、`FYLLO_MCP_EVENT_DIR`、`FYLLO_SESSION_ID` 等进程环境变量表达调用上下文。共享 HTTP 后端后，这些值不能继续作为进程级可变状态，必须转为请求级上下文。

ACP schema 已支持 HTTP MCP spec，当前观测到的 Claude ACP 0.60.0 与 Codex ACP 1.1.5 均声明 `agentCapabilities.mcpCapabilities.http: true`。运行时仍必须读取 initialize response，不能按 agent 名称或版本硬编码。

完整前期调研与代码草图保留在 `references/designs/bundled-mcp-http/design.md`；本 artifact 固化 Apply 阶段必须遵守的架构决策。

## Goals / Non-Goals

**Goals:**

- 应用运行期间只为每个 bundled MCP server 维持一个主进程托管的 HTTP 子进程。
- Agent 只连接应用生命周期内稳定的 proxy URL，不感知后端子进程重启后的随机端口变化。
- 保持不同项目、会话与并发请求的上下文隔离。
- renderer 窗口加载不等待 MCP 后端；仅 ACP `newSession` 前进行有界 readiness 门控。
- 对不支持 HTTP、host 启动失败、后端未就绪和显式禁用场景保留 stdio 行为。
- 保持 bundled MCP tool 的输入、输出、错误语义和持久化路径不变。

**Non-Goals:**

- 本期不实现每项目或每会话 token。
- 本期不实现 context 签名、token-context 绑定、请求签名、路径归属/所有权校验、token 轮换/撤销、重放防护或 Host/Origin 防护。
- 不新增独立代理进程、通用反向代理依赖或 renderer readiness API。
- 不将 MCP server 移入 Electron 主进程内执行。
- 不改变现有 tool 业务能力、OpenSpec/knowledge 数据格式或用户界面。

## Decisions

### 1. 主进程托管独立 HTTP 子进程

新增 `src/main/infra/mcp/bundled-mcp-host.ts`。主进程使用项目既有的 `cross-spawn` 模式，为 `fyllo-specs` 与 `fyllo-cortex` 各启动一个子进程：

- command 使用 `process.execPath`，bundle 路径继续复用 `resolveBundlePath()` 的 dev/packaged 规则。
- env 包含 `ELECTRON_RUN_AS_NODE=1`、`FYLLO_MCP_TRANSPORT=http`、`FYLLO_MCP_AUTH_TOKEN=<shared-token>` 与 server 固定配置。
- stdio 使用 `["ignore", "pipe", "pipe", "ipc"]`；stdout/stderr 必须持续 drain 并带 server name 写日志，禁止记录 token、Authorization 或完整 env。
- 子进程监听 `127.0.0.1:0`，成功后通过 IPC 发送 `{ type: "ready", port }`。
- 子进程监听父进程 IPC `disconnect` 事件并触发 transport abort，避免 detached HTTP listener 在主进程异常退出后成为孤儿进程。

选择子进程而非 in-process，是为了保持当前模块边界与崩溃隔离；一个 MCP server 崩溃不能终止 Electron 主进程或另一个 MCP server。

### 2. 主进程内稳定 proxy 与随机端口映射

host 使用 Node `http.createServer()` 创建单个 loopback proxy，同样监听 `127.0.0.1:0`。proxy 端口在一次应用运行内固定，应用重启后允许变化。

`ManagedMcpServer` 至少保存：

```ts
interface ManagedMcpServer {
  name: BundledMcpServerName;
  process: ChildProcess | null;
  backendPort: number | null;
  state: "starting" | "ready" | "restarting" | "failed";
  failures: number;
}
```

内存路由按 server name 映射：

```text
/mcp/fyllo-specs  -> 127.0.0.1:<fyllo-specs.backendPort>/mcp
/mcp/fyllo-cortex -> 127.0.0.1:<fyllo-cortex.backendPort>/mcp
```

proxy 只接受已注册的 `/mcp/<server-name>`，未知名称返回 404。目标后端 ready 时使用 `http.request()` 流式转发并保持 backpressure；转发前将路径改写为 `/mcp`。透传 MCP、Authorization 与 `X-Fyllo-*` headers，移除 hop-by-hop headers。

收到匹配当前 child 的 ready IPC 后，host 原子写入 `backendPort` 并将状态设为 `ready`。child 退出时先清空端口并将状态设为 `restarting`，再安排重启；旧端口不得继续接收新转发。后端不可用时 proxy 返回 503 与短 `Retry-After`，不得转发到其他 server。

选择稳定代理而非把随机后端 URL直接交给 agent，是为了让已有 ACP session 在后端重启后继续使用原 URL。

### 3. 应用级共享 token

host 每次应用启动使用 `randomBytes(32).toString("base64url")` 生成一次 token。token 在后端重启时复用，在应用退出时清除。

- HTTP 子进程缺少 `FYLLO_MCP_AUTH_TOKEN` 时拒绝启动。
- 每个 HTTP 请求必须携带精确匹配的 `Authorization: Bearer <token>`，否则返回 401。
- `resolveBundledMcpServers()` 将 token 放入 ACP HTTP spec headers。
- token 不得出现在日志、错误详情或 renderer API 中。

当前共享 token 只建立“由本应用启动的 agent 可以访问本应用 bundled MCP”的边界。更细粒度 token、签名和校验按 Non-Goals 延后，不能在本期偷偷扩大范围。

### 4. 双 transport server factory 与请求级实例

将两个 bundled server 的启动入口拆为 `createMcpServer(): McpServer` factory：

- stdio 模式创建一个 server 实例并连接现有 `StdioServerTransport`。
- HTTP 模式调用新增的 `src/mcp-servers/shared/http-server.ts`。
- HTTP handler 每个请求创建独立的 `McpServer + StreamableHTTPServerTransport`，transport 使用 `sessionIdGenerator: undefined`。
- handler 在响应完成或异常后关闭 transport/server 引用，使对象可被垃圾回收；并发请求不得共享已连接的 `McpServer`。

选择请求级对象而非复用 singleton，是因为 MCP SDK server 不能对多个 stateless transport 请求重复 `connect()`，且独立对象最直接地隔离 request id 与 handler 生命周期。这里每个请求创建的是同一子进程内的短生命周期 JavaScript 对象，不是新操作系统进程。

### 5. base64url headers 与 AsyncLocalStorage 上下文

新增：

- `src/mcp-servers/shared/request-context.ts`
- `src/mcp-servers/shared/env.ts`

HTTP spec 使用以下 headers，所有值先按 UTF-8 编码再转为 base64url：

- `X-Fyllo-Project-Path`，必填。
- `X-Fyllo-Project-Data-Dir`，必填。
- `X-Fyllo-Mcp-Event-Dir`，可选。
- `X-Fyllo-Session-Id`，可选。

HTTP handler 在鉴权后只解码一次。非法 base64url、无效 UTF-8 或缺少必填字段返回 400。当前阶段只做结构解析，不做路径归属、canonical path 或 token-context 绑定校验。

`request-context.ts` 使用 `AsyncLocalStorage<RequestContext>` 包裹完整 MCP request。`env.ts` 的 `getProjectPath()`、`getProjectDataDir()`、`getMcpEventDir()`、`getSessionId()` 等 getter 优先读取 request context；没有 HTTP context 时回退现有环境变量，以保持 stdio 模式。

两个 server 下所有直接读取上述 `process.env.FYLLO_*` 的 tool/utils 必须改用统一 getter。并发请求不得修改 `process.env`。

### 6. ACP spec union、能力检测与分流

将 `src/shared/types/mcp.ts` 的 `McpServerSpec` 扩展为判别联合：

- `McpServerSpecStdio`：现有 command/args/env。
- `McpServerSpecHttp`：`type: "http"`、name、稳定 proxy URL、headers。

`src/main/infra/mcp/bundled-mcp-servers.ts`：

- 将 registration 的动态环境函数命名为 `processEnv`，避免与 ACP env wire format 混淆。
- 新增 `toAcpMcpServer()`，集中把内部 stdio/HTTP union 转为 ACP schema。
- 将同步 `getBundledMcpServers()` 替换为异步 `resolveBundledMcpServers()`。

`AcpSession.prepareStartContext()` 与 `session-probe-service.ensureProbe()` 从 ACP initialize response 读取 `mcpCapabilities.http === true`，并且都必须通过 `await resolveBundledMcpServers()` 构造 spec。每个 server 独立选择：

- agent 支持 HTTP，且 proxy 与该后端 ready：HTTP。
- agent 不支持 HTTP，或 proxy/该后端 unavailable：stdio。

同一个 `newSession()` 允许混合 HTTP 与 stdio spec。`FYLLO_DISABLE_BUNDLED_MCP=1` 时返回空列表。

### 7. renderer 不等待，ACP newSession 前共享 readiness

`startBundledMcpHost()` 在 `app.whenReady()` 的 migrations 后调用，但不得等待后端 ready 才注册 IPC 或打开 window。它必须同步建立唯一 startup promise，再在后台生成 token、监听 proxy 和并行 spawn 后端。

新增 `waitForBundledMcpInitialReadiness()`，所有调用者共享同一 promise。promise 在以下任一状态确定后 resolve：

- proxy ready 且所有后端首次 ready；
- 单个后端到达 `INITIAL_BACKEND_READY_TIMEOUT_MS = 3000`，该后端进入 unavailable/restarting；
- token 或 proxy 启动发生 host 级失败，host 进入 unavailable。

`resolveBundledMcpServers()` 在选择 spec 前等待该 promise。并发 probe/chat 只能加入同一 promise，不得重复创建 host、重复 spawn 或启动独立 timeout。renderer 无需新的 readiness IPC；等待期间只有相应 probe/chat 保持 starting。

选择 session 前门控而非 bootstrap barrier，是为了消除首个 probe 竞态而不延迟界面加载。

### 8. 重启与生命周期

host 监听 child `exit`/`error`，对非主动关闭按有限次数指数退避重启。具体常量集中定义在 `bundled-mcp-host.ts`，测试使用 fake timers 验证达到上限后进入 `failed`，不得无限 spawn。重启只替换目标 server 的 process/backendPort，不改变 proxy port 或 token。

`startBundledMcpHost()` 内部必须吸收 startup promise rejection、记录状态并唤醒 readiness waiters，避免 unhandled rejection。

host 在启动后立即通过 `registerDisposable({ name: "bundled-mcp-host", dispose: stopBundledMcpHost })` 接入现有 lifecycle。`stopBundledMcpHost()` 幂等并按以下顺序：

1. 标记 shutting down，禁止新重启。
2. 停止 proxy 接收新连接，并有界等待已有 socket。
3. 清理 restart/ready timers。
4. 对所有 child 发送 SIGTERM 并等待退出。
5. 对超时 child 使用现有平台对应的进程树强制终止模式。
6. 清空 process、port、token 与 promise 引用。

## Risks / Trade-offs

- **[首个 ACP session 最多等待 3 秒]** → 只门控 probe/chat，不阻塞 renderer；超时后按 server 回退 stdio。
- **[HTTP 模式把进程级 context 改为请求级，遗漏直接读取 env 会串项目]** → 全量搜索 `FYLLO_PROJECT_*`、`FYLLO_MCP_EVENT_DIR`、`FYLLO_SESSION_ID`，迁移到统一 getter，并用两个项目并发测试覆盖。
- **[后端在 endpoint 选择后立即崩溃]** → 稳定 proxy 返回 503 并后台恢复；不声称 readiness 检查能消除运行期故障。
- **[共享 token 权限粒度较粗]** → 仅监听 loopback、避免泄露 token；更严格的签名与绑定留给后续独立 proposal。
- **[HTTP 与 stdio 双模式增加分支]** → server factory、env getter 与 ACP 转换集中实现，tool handler 不感知 transport。
- **[packaged app bundle 路径或子进程 IPC 行为不同]** → 复用现有路径解析与 `cross-spawn` 约定，同时覆盖 dev 与 packaged smoke test。

## Migration Plan

1. 先引入 request context、env getter 与 server factory，在保持 stdio 默认路径的情况下迁移所有环境读取。
2. 增加共享 HTTP handler，并分别验证两个 server 的 HTTP initialize、tools/list、tools/call。
3. 扩展 shared MCP spec union 与 ACP 转换，但仍允许调用方完全使用 stdio。
4. 增加主进程 host、proxy、ready IPC、重启及 lifecycle。
5. 最后把 chat/probe 切换到异步 readiness 与按能力分流。
6. 通过 `FYLLO_DISABLE_BUNDLED_MCP=1` 或关闭 HTTP 分流可回滚到不注入 bundled MCP；若 HTTP host 不可用，运行时自动回退现有 stdio spec。

## Open Questions

无。本期 token、安全校验、代理端口、后端端口、readiness 与 fallback 决策均已收敛。

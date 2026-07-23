# Bundled MCP Server HTTP 化设计

> 状态：设计完成，已评审修订，待实现

## 概述

将 bundled MCP server（fyllo-specs、fyllo-cortex）从 stdio transport 迁移到 HTTP transport（Streamable HTTP），由主进程统一托管，降低进程数。

## 动机

当前 stdio 模式下，每个 ACP agent 进程收到 `newSession({ mcpServers })` 后，为每个 stdio MCP server 各 spawn 一个子进程：

下图按每个 agent 一个 active session 简化展示。实际实现会在 chat session 和 probe 的 `newSession()` 中分别传入 MCP 配置，真实进程数取决于各 ACP agent 对多 session MCP 进程的复用策略；实施前应通过进程观测记录基线，但不影响共享 HTTP host 的收敛方向。

```
当前：进程数 = agents × bundledMcpServers

claude-acp 进程
  ├── fyllo-specs 子进程
  ├── fyllo-cortex 子进程
  └── (未来 fyllo-spawn 子进程)

codex-acp 进程
  ├── fyllo-specs 子进程
  ├── fyllo-cortex 子进程
  └── (未来 fyllo-spawn 子进程)
```

迁移后由主进程统一启动，每个 MCP server 只有一个后端子进程实例；主进程自身提供一个应用生命周期内稳定的 HTTP 代理端口：

```
目标：进程数 = agents + bundledMcpServers

主进程
  ├── bundled MCP HTTP proxy (稳定端口，仅主进程内监听，不新增进程)
  ├── fyllo-specs 子进程 (随机后端端口，仅由 proxy 转发)
  ├── fyllo-cortex 子进程 (随机后端端口，仅由 proxy 转发)
  └── (未来 fyllo-spawn 子进程)

claude-acp 进程 (无 MCP 子进程，通过稳定 proxy URL 访问)
codex-acp 进程 (无 MCP 子进程，通过稳定 proxy URL 访问)
```

## 进程模型

### 选择：主进程 spawn 独立子进程

每个 bundled MCP server 由主进程 spawn 为独立子进程，子进程内启动 HTTP server（`StreamableHTTPServerTransport`），监听 `127.0.0.1` 随机后端端口。主进程另外创建一个不产生新进程的 HTTP proxy，监听 `127.0.0.1` 随机端口，并在整个应用生命周期内保持端口和 URL 不变。

ACP agent 只接触 proxy URL，不直接接触后端端口。后端子进程重启并获得新端口后，主进程只更新 proxy 的内存路由，已有 ACP session 无需更新 MCP 配置。

选择子进程而非 in-process 的理由：

- **代码隔离**：MCP server 代码（`src/mcp-servers/*/`）独立维护，不依赖主进程模块
- **崩溃隔离**：一个 MCP server crash 不影响主进程和其他 server
- **与 fyllo-spawn 一致**：fyllo-spawn 需要 IPC channel 与主进程通信，也是子进程模型

### 启动流程

```
主进程 app ready
  → 生成应用生命周期内唯一的共享 bearer token
  → 启动 bundled MCP HTTP proxy，listen(0, "127.0.0.1")
  → 对每个 bundled MCP server：
    → spawn 子进程，env 中传入 FYLLO_MCP_TRANSPORT=http, FYLLO_MCP_AUTH_TOKEN=<shared-token>, 进程级固定参数
    → 子进程内：启动 McpServer + StreamableHTTPServerTransport，listen(0, "127.0.0.1")
    → 子进程通过 IPC 回报 { type: "ready", port }
    → 主进程记录 name → backendPort 映射
  → 对外暴露 name → { proxyUrl, sharedToken } 映射
```

proxy URL 使用稳定路径区分 server，例如：

```
http://127.0.0.1:<proxyPort>/mcp/fyllo-specs
http://127.0.0.1:<proxyPort>/mcp/fyllo-cortex
```

proxy 将路径重写为后端统一的 `/mcp`，并透传 HTTP method、MCP headers、Authorization、自定义 `X-Fyllo-*` headers 和请求体。

### 安全

- 绑定 `127.0.0.1`，仅本机可访问
- 主进程生成应用级共享 bearer token，通过 spawn env 传给所有 bundled MCP server 子进程
- agent 发请求时通过 `McpServerHttp.headers` 携带 `Authorization: Bearer <token>`
- 子进程收到请求时验证 token，不匹配则 401
- `FYLLO_MCP_AUTH_TOKEN` 缺失或为空时，HTTP 模式子进程必须拒绝启动，不允许降级为无鉴权监听
- token 在应用生命周期内保持不变，后端子进程重启时继续使用同一个 token，避免已有 ACP session 的 headers 失效
- proxy 不记录 token 或完整请求 headers；日志只记录 server name、状态码、后端端口和错误摘要

### 本期安全边界

本期只实现应用级共享 token：

- 主进程生成一个 token，所有 bundled MCP server 和 ACP session 共享。
- token 通过 spawn env 传给后端，通过 ACP `newSession()` 的 HTTP headers 传给 agent。
- 后端只校验 token 是否存在且完全匹配；不匹配返回 401。
- 请求上下文只做 base64url 解码、必填字段存在性等传输层结构检查，不把这些检查视为项目授权边界。

本期不实现 per-project/per-session token、token 与 context 绑定、请求签名、路径授权或更严格的来源校验。这是明确的阶段性范围，不代表这些安全能力被永久否决。

### 后续安全演进（本期不实施）

功能稳定后单独评估并设计以下能力：

- 将 token 限定到 project/session，或使用主进程密钥对规范化 context 做 HMAC 签名，防止调用方改写 context。
- 将 `projectPath`、`projectDataDir`、`mcpEventDir`、`sessionId` 绑定为同一组不可拆分的 claims。
- 校验路径规范化结果、允许访问的 project 集合，以及 data/event 目录与 project 的归属关系。
- 增加 token 轮换、过期、重放边界和按 session 撤销机制。
- 根据实际 threat model 增加 `Host` / `Origin` 校验及 localhost DNS rebinding 防护。
- 明确自定义或不受信任 ACP agent 是否属于安全边界内调用方，并据此决定最小权限策略。

上述项目需要在 HTTP 化功能稳定后通过独立 proposal 收敛，不纳入本期实现或验收条件。

### 生命周期管理

- **健康检查 & 重启**：监听子进程 `exit` 事件，非正常退出时按有限次数指数退避自动重启，更新 proxy 的后端端口映射；proxy URL 和共享 token 保持不变
- **后端不可用**：后端启动中或重启期间，proxy 对该 server 返回 503 和 `Retry-After`，不得将请求错误转发到其他 bundled MCP server
- **新 session 降级**：创建 ACP session 时如果 HTTP host 或目标后端尚未 ready，使用现有 stdio spec；不能因 agent 声明支持 HTTP 就返回不可用 URL
- **关闭**：app quit 时先让 proxy 停止接受新请求，再向所有子进程发送 SIGTERM，等待退出，超时后强制终止
- **超时**：spawn 后设等待超时（如 10s），子进程未回报 `ready` 视为启动失败

## Session 隔离

### 问题

stdio 模式下，每个 MCP server 实例天然进程隔离——`FYLLO_SESSION_ID`、`FYLLO_PROJECT_PATH` 等通过进程 env 注入，各实例互不干扰。

HTTP 模式下变成共享实例，需要通过请求级参数区分调用来源。

### 方案：HTTP headers 传递请求级上下文

将原来的进程环境变量按生命周期分为两类：

**进程级（spawn env）**— 启动时固定，不随 session 变化：

| 环境变量                  | 说明                       |
| ------------------------- | -------------------------- |
| `ELECTRON_RUN_AS_NODE`    | Electron Node 模式标志     |
| `FYLLO_MCP_TRANSPORT`     | transport 模式（`http`）   |
| `FYLLO_MCP_AUTH_TOKEN`    | bearer token               |
| `FYLLO_OPENSPEC_CLI_PATH` | fyllo-specs 专属，CLI 路径 |
| `FYLLO_MCP_TELEMETRY`     | 遥测开关                   |

这些仍然通过 spawn 时的 env 传入子进程，tool handler 直接从 `process.env` 读取。

**请求级（HTTP headers）**— 随 project/session 变化：

| 环境变量                 | HTTP Header                | 生命周期   | Header value      |
| ------------------------ | -------------------------- | ---------- | ----------------- |
| `FYLLO_PROJECT_PATH`     | `X-Fyllo-Project-Path`     | 按 project | UTF-8 → base64url |
| `FYLLO_PROJECT_DATA_DIR` | `X-Fyllo-Project-Data-Dir` | 按 project | UTF-8 → base64url |
| `FYLLO_MCP_EVENT_DIR`    | `X-Fyllo-Mcp-Event-Dir`    | 按 project | UTF-8 → base64url |
| `FYLLO_SESSION_ID`       | `X-Fyllo-Session-Id`       | 按 session | UTF-8 → base64url |

ACP 的 `McpServerHttp.headers` 声明这些 headers，agent 在每次 MCP 请求中自动携带。所有值统一以 UTF-8 编码后转换为 base64url，避免中文、空格等合法项目路径被 Node HTTP header 校验拒绝。子进程只解码一次；非法 base64url、无效 UTF-8 或缺失必填字段直接返回 400。

`projectPath` 和 `projectDataDir` 为 HTTP 请求的必填 context；`mcpEventDir` 和 `sessionId` 可选。当前阶段共享 token 不与具体 context 绑定，context headers 仍由 ACP session 配置提供。本期只检查编码和必填字段，不增加路径授权、路径归属或 token-context 一致性校验。

### RequestContext

子进程 HTTP handler 层解析 headers，通过 `AsyncLocalStorage` 注入 per-request context：

```typescript
// src/mcp-servers/shared/request-context.ts

interface RequestContext {
  projectPath: string;
  projectDataDir: string;
  mcpEventDir: string;
  sessionId: string | undefined;
  extras: Record<string, string>;
}
```

通用 headers（`X-Fyllo-Project-Path` 等）经过 base64url 解码后映射到具名字段。不在已知列表中的 `X-Fyllo-*` headers 收入 `extras`，为未来扩展预留空间；extras 的值遵循相同编码规则。

HTTP handler 在收到请求时：

```
校验并解码 X-Fyllo-* headers → 构建 RequestContext → AsyncLocalStorage.run(ctx, handleRequest)
```

### 统一 getter

tool handler 需要同时支持 stdio 和 HTTP 两种运行模式。在 `src/mcp-servers/shared/` 中提供统一 getter：

```typescript
// src/mcp-servers/shared/env.ts

export function getProjectPath(): string {
  // HTTP 模式：从 RequestContext 读取
  const ctx = tryGetRequestContext();
  if (ctx) return ctx.projectPath;
  // stdio 模式：从 process.env 读取
  return process.env.FYLLO_PROJECT_PATH || process.cwd();
}

export function getSessionId(): string | undefined {
  const ctx = tryGetRequestContext();
  if (ctx) return ctx.sessionId;
  return process.env.FYLLO_SESSION_ID;
}

// 同理：getProjectDataDir(), getMcpEventDir(), getExtra(key) 等
```

tool handler 从 `process.env.FYLLO_PROJECT_PATH` 改为 `getProjectPath()`，对调用方透明。

## Agent 兼容性

### MCP transport 能力检测

ACP `InitializeResponse.agentCapabilities.mcpCapabilities.http` 声明 agent 是否支持 HTTP MCP server。

```typescript
// 从 initializeResponse 获取
const supportsHttp = entry.initializeResponse.agentCapabilities?.mcpCapabilities?.http === true;
```

检测点：

- `acp-session.ts` 的 `prepareStartContext()`
- `session-probe-service.ts` 的 `ensureProbe()`

### 分流逻辑

根据 agent 能力和 HTTP host readiness，异步 `resolveBundledMcpServers()` 先等待共享的首次 readiness promise，再为每个 bundled server 独立选择 spec：

- agent 支持 HTTP，且 proxy 与目标后端均 ready → `McpServerSpecHttp`（稳定 proxy URL + headers）
- agent 不支持 HTTP，或 proxy / 目标后端未 ready → `McpServerSpecStdio`（command + args + env，现有逻辑）

同一个 `newSession()` 可以混合 HTTP 和 stdio spec。例如 fyllo-specs 正在重启而 fyllo-cortex 正常时，新 session 对 fyllo-specs 使用 stdio、对 fyllo-cortex 使用 HTTP。已有 HTTP session 继续保留稳定 proxy URL，并在后端恢复后重新可用。

## 类型设计

### McpServerSpec 扩展

```typescript
// src/shared/types/mcp.ts

export interface McpServerSpecStdio {
  type: "stdio";
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface McpServerSpecHttp {
  type: "http";
  name: string;
  url: string;
  headers: Record<string, string>;
}

export type McpServerSpec = McpServerSpecStdio | McpServerSpecHttp;

export interface McpEnvVariable {
  name: string;
  value: string;
}
```

### BundledMcpServerRegistration 拆分

```typescript
// src/main/infra/mcp/bundled-mcp-servers.ts

interface BundledMcpServerRegistration {
  name: BundledMcpServerName;
  // 进程级 env：spawn 子进程时传入，不随 session 变化
  // 如 FYLLO_OPENSPEC_CLI_PATH
  processEnv?: () => Record<string, string>;
}
```

现有的注册：

```typescript
const bundledMcpServers: BundledMcpServerRegistration[] = [
  {
    name: "fyllo-specs",
    processEnv: () => ({
      FYLLO_OPENSPEC_CLI_PATH: resolveOpenspecCliPath(),
    }),
  },
  {
    name: "fyllo-cortex",
  },
];
```

### ACP 类型转换

```typescript
function toAcpMcpServer(spec: McpServerSpec): AcpMcpServer {
  if (spec.type === "http") {
    return {
      type: "http",
      name: spec.name,
      url: spec.url,
      headers: Object.entries(spec.headers).map(([name, value]) => ({ name, value })),
    };
  }
  return {
    name: spec.name,
    command: spec.command,
    args: spec.args,
    env: Object.entries(spec.env).map(([name, value]) => ({ name, value })),
  };
}
```

## MCP Server 侧改造

### server.ts 双模式启动

以 fyllo-specs 为例：

```typescript
// src/mcp-servers/fyllo-specs/src/server.ts

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "fyllo-specs", version: FYLLO_SPECS_SERVER_VERSION });
  registerTools(server);
  return server;
}

export async function startServer(signal?: AbortSignal): Promise<void> {
  if (process.env.FYLLO_MCP_TRANSPORT === "http") {
    await startHttpMode(createMcpServer, signal);
  } else {
    await startStdioMode(createMcpServer(), signal);
  }
}
```

`FYLLO_MCP_TRANSPORT` 由 `bundled-mcp-host.ts` 在 spawn 时通过 env 设定。现有的 stdio 路径（agent 自己 fork MCP server）不设置此变量，默认走 stdio。

HTTP 模式必须传入 factory：stateless transport 下每个请求创建一组新的 `McpServer + StreamableHTTPServerTransport`。同一个 `McpServer` 不能在多个请求中重复 `connect()`，也不能被并发请求共享。stdio 模式仍然只创建一个 server 实例。

### HTTP 模式实现

HTTP 启动逻辑提取为 `src/mcp-servers/shared/http-server.ts` 共享模块：

```typescript
// src/mcp-servers/shared/http-server.ts

import { createServer } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { parseRequestContext, RequestContextError, runWithContext } from "./request-context";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type McpServerFactory = () => McpServer;

export async function startHttpMode(
  createMcpServer: McpServerFactory,
  signal?: AbortSignal
): Promise<void> {
  const token = process.env.FYLLO_MCP_AUTH_TOKEN;
  if (!token) {
    throw new Error("FYLLO_MCP_AUTH_TOKEN is required in HTTP mode");
  }

  const httpServer = createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }

    try {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401).end();
        return;
      }

      const ctx = parseRequestContext(req.headers);
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        void transport.close();
        void server.close();
      };
      res.once("close", close);

      await runWithContext(ctx, async () => {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      });
    } catch (error) {
      if (!res.headersSent) {
        const invalidContext = error instanceof RequestContextError;
        res.writeHead(invalidContext ? 400 : 500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: invalidContext ? -32602 : -32603,
              message: invalidContext ? error.message : "Internal server error",
            },
            id: null,
          })
        );
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      const addr = httpServer.address() as import("net").AddressInfo;
      process.send?.({ type: "ready", port: addr.port });
      resolve();
    });
  });

  if (signal) {
    signal.addEventListener("abort", () => {
      httpServer.close();
    });
  }
}
```

### request-context.ts

```typescript
// src/mcp-servers/shared/request-context.ts

import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  projectPath: string;
  projectDataDir: string;
  mcpEventDir: string;
  sessionId: string | undefined;
  extras: Record<string, string>;
}

const store = new AsyncLocalStorage<RequestContext>();

const KNOWN_HEADERS: Record<string, keyof Omit<RequestContext, "extras">> = {
  "x-fyllo-project-path": "projectPath",
  "x-fyllo-project-data-dir": "projectDataDir",
  "x-fyllo-mcp-event-dir": "mcpEventDir",
  "x-fyllo-session-id": "sessionId",
};

export class RequestContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestContextError";
  }
}

function decodeHeaderValue(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new RequestContextError("Invalid base64url request context");
  }
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
    throw new RequestContextError("Invalid UTF-8 request context");
  }
  return decoded;
}

export function parseRequestContext(
  headers: Record<string, string | string[] | undefined>
): RequestContext {
  const ctx: RequestContext = {
    projectPath: "",
    projectDataDir: "",
    mcpEventDir: "",
    sessionId: undefined,
    extras: {},
  };

  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (!key.startsWith("x-fyllo-")) continue;

    const encodedValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (encodedValue === undefined) continue;
    const value = decodeHeaderValue(encodedValue);

    const knownField = KNOWN_HEADERS[key];
    if (knownField) {
      (ctx as Record<string, unknown>)[knownField] = value;
    } else {
      // 去掉 x-fyllo- 前缀存入 extras
      const extraKey = key.slice("x-fyllo-".length);
      ctx.extras[extraKey] = value;
    }
  }

  if (!ctx.projectPath || !ctx.projectDataDir) {
    throw new RequestContextError("Missing required Fyllo request context");
  }
  return ctx;
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function getRequestContext(): RequestContext {
  const ctx = store.getStore();
  if (!ctx) throw new Error("No request context available");
  return ctx;
}

export function tryGetRequestContext(): RequestContext | undefined {
  return store.getStore();
}
```

### 统一 getter（env.ts）

```typescript
// src/mcp-servers/shared/env.ts

import { tryGetRequestContext } from "./request-context";

export function getProjectPath(): string {
  const ctx = tryGetRequestContext();
  if (ctx) return ctx.projectPath;
  return process.env.FYLLO_PROJECT_PATH || process.cwd();
}

export function getProjectDataDir(): string {
  const ctx = tryGetRequestContext();
  if (ctx) return ctx.projectDataDir;
  const value = process.env.FYLLO_PROJECT_DATA_DIR;
  if (!value) throw new Error("FYLLO_PROJECT_DATA_DIR not set");
  return value;
}

export function getMcpEventDir(): string | undefined {
  const ctx = tryGetRequestContext();
  if (ctx) return ctx.mcpEventDir || undefined;
  return process.env.FYLLO_MCP_EVENT_DIR;
}

export function getSessionId(): string | undefined {
  const ctx = tryGetRequestContext();
  if (ctx) return ctx.sessionId;
  return process.env.FYLLO_SESSION_ID;
}

export function getExtra(key: string): string | undefined {
  const ctx = tryGetRequestContext();
  return ctx?.extras[key];
}
```

## 主进程侧改造

### bundled-mcp-host.ts（新增）

```typescript
// src/main/infra/mcp/bundled-mcp-host.ts

// 管理稳定 proxy、bundled MCP server 子进程和应用级共享 token
// 职责：proxy 转发、spawn、后端端口记录、健康检查、重启、关闭

interface ManagedMcpServer {
  name: BundledMcpServerName;
  process: ChildProcess | null;
  backendPort: number | null;
  state: "starting" | "ready" | "restarting" | "failed";
  failures: number;
}

const managedServers = new Map<string, ManagedMcpServer>();

interface BundledMcpHost {
  proxyServer: HttpServer;
  proxyPort: number;
  token: string;
  servers: Map<BundledMcpServerName, ManagedMcpServer>;
}

// app ready 时调用；立即建立共享 startup promise 并在后台启动 host，
// 不等待后端 ready，也不阻塞 renderer window。
export function startBundledMcpHost(): void;

// 所有调用方共享同一个 promise；在 host ready，或首次启动超时 / 失败后 resolve。
export async function waitForBundledMcpInitialReadiness(): Promise<void>;

// 仅在 proxy 和指定后端都 ready 时返回 endpoint
export function getMcpServerEndpoint(
  name: BundledMcpServerName
): { url: string; token: string } | null;

// 注册到主进程 lifecycle，停止 proxy 后再终止后端子进程
export async function stopBundledMcpHost(): Promise<void>;
```

host 使用 `randomBytes(32).toString("base64url")` 生成共享 token；生成结果为空时视为启动失败。创建后端进程必须遵守主进程约定使用 `cross-spawn`，并配置 `stdio: ["ignore", "pipe", "pipe", "ipc"]`：

- IPC channel 用于接收 `{ type: "ready", port }`。
- stdout/stderr 必须持续 drain 并写入带 server name 的主进程日志，避免管道回压阻塞后端。
- 日志不得输出完整 env、Authorization 或 token。
- `FYLLO_DISABLE_BUNDLED_MCP=1` 时不启动 proxy 或后端子进程，继续保持当前“完全禁用 bundled MCP”语义。

### 启动时序与首个 probe 门控

渲染进程会在项目和 agent 可用后通过 200ms debounce 发起 `probeEnsure()`。该 debounce 只是 UI 侧合并频繁状态变化的机制，不能作为 bundled MCP 后端已就绪的保证，也不能依赖 ACP agent 初始化耗时来碰巧掩盖竞态。

主进程启动 bundled MCP host 后继续注册 IPC 并打开 renderer window，不把 MCP 子进程 readiness 放在 UI 启动关键路径上。门控发生在主进程准备 ACP `newSession({ mcpServers })` 之前：

```text
app.whenReady()
  → syncShellPath()
  → runAllMigrations()
  → startBundledMcpHost()
      ↳ 后台：生成 token、启动 proxy、并行 spawn 后端
  → registerAllHandlers()
  → setup broadcasts
  → openLauncherWindow()
  → renderer bootstrap
  → probeEnsure()
      → ACP initialize
      → await resolveBundledMcpServers()
          → await 共享的首次 readiness promise
          → 每个后端 ready，或到达首次启动超时
          → 生成 HTTP / stdio specs
      → ACP newSession({ mcpServers })
```

`startBundledMcpHost()` 必须同步建立并保存唯一的首次 startup promise，再启动异步工作，确保 renderer 很快发起 probe 时也只能加入同一个等待过程，不会创建第二套 host、重复 spawn 或读到未受控的半初始化状态。

`waitForBundledMcpInitialReadiness()` 在以下结果之一确定后 resolve：

1. proxy 已成功监听，且每个 bundled server 分别进入 `ready`；
2. 某些 server 的首次启动达到有界超时，分别进入 `restarting` / `failed`；
3. token 生成或 proxy listen 出现 host 级失败，host 被标记为 unavailable。

首次后端就绪等待使用固定常量 `INITIAL_BACKEND_READY_TIMEOUT_MS = 3000`，所有后端并行等待，不按 server 数量串行累加。超时只影响对应后端：等待中的 probe/chat 随即继续，该 server 使用现有 stdio fallback，其他已 ready 的 server 仍使用 HTTP。超时后 host 在后台按既定退避策略继续重启。

token 生成或 proxy listen 失败属于 host 级失败，必须被 startup promise 吸收并记录为 unavailable，不能产生 unhandled rejection；等待中的 probe/chat 随即全部使用 stdio。单个后端首次启动失败不能错误降级已经 ready 的其他后端。

`acp-session.ts` 和 `session-probe-service.ts` 都必须通过同一个异步 `resolveBundledMcpServers()` 获取 specs，禁止直接读取 endpoint 后调用 `newSession()`。多个并发 probe/chat 共享 startup promise；renderer 只表现为对应 probe/chat 暂时处于 starting，不需要增加 host readiness IPC、轮询或全局 loading。

这个门控只解决“首个 `newSession` 与首次 spawn 并发”的启动竞态。运行期间后端在 endpoint 选定后崩溃仍由稳定 proxy URL、503 和后台重启策略处理；不能假设一次 readiness 检查可以消除运行期故障。

### 稳定 proxy 转发规则

proxy 使用 Node `http.createServer()` 和 `http.request()` 流式转发，不引入独立 proxy 进程：

- 只接受 `/mcp/<bundled-server-name>`，未知 name 返回 404。
- 后端 ready 时将路径改写为 `/mcp`，流式 pipe request/response，保留 backpressure。
- 透传 MCP 需要的 `Content-Type`、`Accept`、`MCP-Protocol-Version`、`MCP-Session-Id`、`Last-Event-ID`、Authorization 和 `X-Fyllo-*` headers。
- 移除 `Connection`、`Keep-Alive`、`Proxy-Authenticate`、`Proxy-Authorization`、`TE`、`Trailer`、`Transfer-Encoding`、`Upgrade` 等 hop-by-hop headers，由两侧连接各自管理。
- 后端不存在、启动中或重启中时返回 503，并携带短 `Retry-After`；转发过程中后端断开时终止当前响应，不切换到其他 server。
- 子进程 `ready` 后原子更新对应 `backendPort`；子进程退出时先将状态改为 `restarting` 并清空端口，再进入退避重启。
- proxy listener、proxy URL 和共享 token 在应用退出前保持不变。后端重启不得重新生成 token 或重新监听 proxy。

### bundled-mcp-servers.ts 改造

```typescript
// src/main/infra/mcp/bundled-mcp-servers.ts

function encodeHeaderValue(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export async function resolveBundledMcpServers(opts: {
  projectPath: string;
  fylloSessionId?: string;
  supportsHttp: boolean;
}): Promise<McpServerSpec[]> {
  if (process.env.FYLLO_DISABLE_BUNDLED_MCP === "1") {
    return [];
  }

  await waitForBundledMcpInitialReadiness();

  return bundledMcpServers.map((server) => {
    const endpoint = opts.supportsHttp ? getMcpServerEndpoint(server.name) : null;
    return endpoint ? buildHttpSpec(server, endpoint, opts) : buildStdioSpec(server, opts);
  });
}

function buildHttpSpec(
  server: BundledMcpServerRegistration,
  endpoint: { url: string; token: string },
  opts: { projectPath: string; fylloSessionId?: string }
): McpServerSpecHttp {
  return {
    type: "http",
    name: server.name,
    url: endpoint.url,
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      "X-Fyllo-Project-Path": encodeHeaderValue(opts.projectPath),
      "X-Fyllo-Project-Data-Dir": encodeHeaderValue(projectDir(opts.projectPath)),
      "X-Fyllo-Mcp-Event-Dir": encodeHeaderValue(mcpEventsDir(opts.projectPath)),
      ...(opts.fylloSessionId
        ? { "X-Fyllo-Session-Id": encodeHeaderValue(opts.fylloSessionId) }
        : {}),
    },
  };
}

function buildStdioSpec(
  server: BundledMcpServerRegistration,
  opts: { projectPath: string; fylloSessionId?: string }
): McpServerSpecStdio {
  // 现有逻辑，保持不变
  return {
    type: "stdio",
    name: server.name,
    command: process.execPath,
    args: [resolveBundlePath(server.name)],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      FYLLO_PROJECT_PATH: opts.projectPath,
      FYLLO_PROJECT_DATA_DIR: projectDir(opts.projectPath),
      FYLLO_MCP_TELEMETRY: "0",
      FYLLO_MCP_EVENT_DIR: mcpEventsDir(opts.projectPath),
      ...(opts.fylloSessionId ? { FYLLO_SESSION_ID: opts.fylloSessionId } : {}),
      ...(server.processEnv?.() ?? {}),
    },
  };
}

// ACP 协议转换
export function toAcpMcpServer(spec: McpServerSpec): AcpMcpServer {
  if (spec.type === "http") {
    return {
      type: "http",
      name: spec.name,
      url: spec.url,
      headers: Object.entries(spec.headers).map(([name, value]) => ({ name, value })),
    };
  }
  return {
    name: spec.name,
    command: spec.command,
    args: spec.args,
    env: Object.entries(spec.env).map(([name, value]) => ({ name, value })),
  };
}
```

### acp-session.ts 改造

`prepareStartContext` 中获取 agent 的 HTTP 能力，传给异步 `resolveBundledMcpServers`：

```typescript
private async prepareStartContext(): Promise<StartContext | null> {
  const entry = await this.getProcessEntry();
  if (!entry) return null;

  const supportsHttp =
    entry.initializeResponse.agentCapabilities?.mcpCapabilities?.http === true;

  const mcpServers = await resolveBundledMcpServers({
    projectPath: this.opts.projectPath,
    fylloSessionId: this.opts.fylloSessionId,
    supportsHttp,
  }).map(toAcpMcpServer);

  // ... 后续不变
}
```

`session-probe-service.ts` 中 `ensureProbe` 同理。

### bootstrap 与 shutdown 接入

`src/main/bootstrap/index.ts` 在 `app.whenReady()` 内完成 shell path 同步和 migrations 后启动 bundled MCP host，但不等待 MCP 后端 ready；随后立即注册 IPC handlers、broadcasts 并打开窗口。host 内部持有并吸收 startup promise 的失败，后续 `resolveBundledMcpServers()` 负责在创建 ACP session 前等待其结算。

调用 host 启动后立即通过 `registerDisposable()` 注册异步清理；即使 host 仍处于 starting 或最终失败，`stopBundledMcpHost()` 也必须能安全回收部分初始化资源：

```typescript
startBundledMcpHost();
registerDisposable({
  name: "bundled-mcp-host",
  dispose: stopBundledMcpHost,
});

registerAllHandlers();
setupProbeBroadcast(projectWindowManager);
setupAgentEventBroadcast(projectWindowManager);
setupProposalStatusBroadcast(projectWindowManager);
projectWindowManager.openLauncherWindow();
```

`stopBundledMcpHost()` 必须可幂等调用，并遵循以下顺序：

1. 标记 host shutting down，禁止安排新的重启 timer。
2. 停止 proxy 接受新连接，并等待已有 proxy socket 结束到一个有界超时。
3. 清理所有 restart timer。
4. 向后端子进程发送 SIGTERM 并等待退出。
5. 对超时未退出的子进程执行平台对应的强制终止。
6. 清空端口、process 和 token 引用。

## Transport 模式

使用 `StreamableHTTPServerTransport` 的 **stateless 模式**（`sessionIdGenerator: undefined`）。

理由：

- bundled MCP server 的 tool 都是无状态的（每次 tool call 独立执行）
- session 隔离由 HTTP headers 中的 `RequestContext` 实现，不需要 MCP 层面的 session
- stateless 更简单，不需要管理 MCP session 生命周期

## 文件变动总览

| 文件                                                      | 变更类型 | 说明                                                                                                    |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `src/shared/types/mcp.ts`                                 | 修改     | `McpServerSpec` 扩展为 `McpServerSpecStdio \| McpServerSpecHttp` union                                  |
| `src/main/infra/mcp/bundled-mcp-host.ts`                  | **新增** | 管理稳定 proxy、共享 token、MCP server 子进程、后端路由、重启和关闭                                     |
| `src/main/infra/mcp/bundled-mcp-servers.ts`               | 修改     | 拆分 stdio/http 构建路径；新增 `toAcpMcpServer()`；`BundledMcpServerRegistration.env` 改为 `processEnv` |
| `src/main/bootstrap/index.ts`                             | 修改     | 后台启动 host，不阻塞 IPC 注册和窗口加载，并通过 lifecycle 注册清理                                     |
| `src/main/services/session/chat/acp-session.ts`           | 修改     | `prepareStartContext` 检测 HTTP 能力，等待共享 readiness 后调用新接口                                   |
| `src/main/services/session/chat/session-probe-service.ts` | 修改     | `ensureProbe` 共享同一 readiness 门控                                                                   |
| `src/mcp-servers/shared/request-context.ts`               | **新增** | base64url 解码、必填字段校验和 `AsyncLocalStorage` 请求上下文，含 `extras`                              |
| `src/mcp-servers/shared/http-server.ts`                   | **新增** | 强制 token 的共享 HTTP 启动逻辑；每个请求创建独立 server/transport                                      |
| `src/mcp-servers/shared/env.ts`                           | **新增** | 统一 getter（双模兼容）                                                                                 |
| `src/mcp-servers/fyllo-specs/src/server.ts`               | 修改     | 双模式启动                                                                                              |
| `src/mcp-servers/fyllo-cortex/src/server.ts`              | 修改     | 双模式启动                                                                                              |
| `src/mcp-servers/fyllo-specs/src/tools/*.ts`              | 修改     | `process.env.FYLLO_*` → 统一 getter                                                                     |
| `src/mcp-servers/fyllo-specs/src/utils/*.ts`              | 修改     | 同上                                                                                                    |
| `src/mcp-servers/fyllo-cortex/src/tools/*.ts`             | 修改     | 同上                                                                                                    |
| `src/mcp-servers/fyllo-cortex/src/utils/*.ts`             | 修改     | 同上                                                                                                    |

## 实施顺序

1. **请求上下文基础设施**：新增 `shared/request-context.ts`、`shared/env.ts`，实现 base64url 编解码、必填字段校验和 `AsyncLocalStorage`
2. **MCP server 双模式**：新增 `shared/http-server.ts`，将两个 server 改为 factory；迁移 tool handler 到统一 getter（完成后 stdio 仍可独立工作）
3. **类型扩展**：将 `McpServerSpec` 修改为 stdio/http union，并集中 ACP 协议转换
4. **主进程稳定 host**：新增 `bundled-mcp-host.ts`，先实现 proxy 和共享 token，再接入后端 spawn、ready IPC、退避重启与 shutdown
5. **bootstrap 与分流**：app ready 后后台启动 host 并立即继续加载窗口；修改 `bundled-mcp-servers.ts`、`acp-session.ts`、`session-probe-service.ts`，仅在 ACP `newSession` 前共享有界 readiness barrier，再按 agent capability 和单个后端 readiness 分流
6. **测试与端到端验证**：先覆盖独立模块和故障路径，再用支持 HTTP 的 agent 验证 HTTP 路径、用不支持 HTTP 的 agent 验证 stdio fallback

## 验证矩阵

### 已确认的设计前提

- [x] ACP schema 支持 `McpServerHttp` 的 URL 与 headers。
- [x] 当前观测到的 Claude ACP 0.60.0 和 Codex ACP 1.1.5 均声明 `mcpCapabilities.http: true`；运行时仍以 initialize response 动态判断，不硬编码 agent 名称或版本。
- [x] 当前 MCP SDK 的 stateless 示例要求每个请求创建独立 `McpServer + StreamableHTTPServerTransport`，不复用已连接的 `McpServer`。

### 单元与集成验证

- [ ] HTTP 模式缺少 `FYLLO_MCP_AUTH_TOKEN` 时 server 拒绝启动。
- [ ] token 缺失或错误返回 401；合法 token 可完成 initialize、tools/list 和 tools/call。
- [ ] 同一后端的串行和并发请求分别创建独立 server/transport，不出现 `Already connected` 或 request id 串线。
- [ ] 中文、空格和非 ASCII 项目路径经过 header 编解码后保持一致；非法 base64url 和缺失必填 context 返回 400。
- [ ] 两个项目、两个 session 并发调用时，`AsyncLocalStorage` context 不串线，plan/event/knowledge 路径仍指向各自项目。
- [ ] proxy 只转发已注册 server path，正确移除 hop-by-hop headers，并完整透传 MCP、Authorization 和 `X-Fyllo-*` headers。
- [ ] 后端退出后 proxy URL 和 token 不变；不可用窗口返回 503；新端口 ready 后已有 URL 可恢复调用。
- [ ] 达到最大重启次数后状态进入 failed，不再无限 spawn；新 ACP session 对该 server 使用 stdio fallback。
- [ ] bootstrap 启动 host 后无需等待后端 ready 即可注册 IPC、打开 renderer window；MCP 启动慢或失败不延迟 UI 加载。
- [ ] 首个 probe 与正常 chat 并发到达时共享同一个 startup promise，不重复 spawn，且都在调用 ACP `newSession` 前等待 readiness 结算。
- [ ] 多个后端并行等待首次 ready；单个后端超时不会串行延长总等待，也不会使其他已 ready 后端降级。
- [ ] 首次启动超时后等待中的 probe/chat 正常继续，对超时后端使用 stdio；后台重启成功后，后续新 session 可改用 HTTP。
- [ ] 不支持 HTTP 的 agent、host 启动失败和单个后端未 ready 时继续生成现有 stdio spec。
- [ ] app quit 时 proxy、重启 timer、后端进程和进行中的连接都能在 lifecycle 超时内回收。
- [ ] dev 与 packaged app 均能找到 bundled server bundle 和 OpenSpec CLI，proxy 只监听 loopback。

context 签名、路径归属、token-context 绑定、Host/Origin、轮换与撤销相关测试随“后续安全演进” proposal 定义，不属于本验证矩阵。

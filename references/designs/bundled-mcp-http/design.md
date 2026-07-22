# Bundled MCP Server HTTP 化设计

> 状态：设计完成，待实现

## 概述

将 bundled MCP server（fyllo-specs、fyllo-cortex）从 stdio transport 迁移到 HTTP transport（Streamable HTTP），由主进程统一托管，降低进程数。

## 动机

当前 stdio 模式下，每个 ACP agent 进程收到 `newSession({ mcpServers })` 后，为每个 stdio MCP server 各 spawn 一个子进程：

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

迁移后由主进程统一启动，每个 MCP server 只有一个实例：

```
目标：进程数 = agents + bundledMcpServers

主进程
  ├── fyllo-specs 子进程 (HTTP server on 127.0.0.1)
  ├── fyllo-cortex 子进程 (HTTP server on 127.0.0.1)
  └── (未来 fyllo-spawn 子进程)

claude-acp 进程 (无 MCP 子进程，通过 HTTP 访问)
codex-acp 进程 (无 MCP 子进程，通过 HTTP 访问)
```

## 进程模型

### 选择：主进程 spawn 独立子进程

每个 bundled MCP server 由主进程 spawn 为独立子进程，子进程内启动 HTTP server（`StreamableHTTPServerTransport`），监听 `127.0.0.1` 随机端口。

选择子进程而非 in-process 的理由：

- **代码隔离**：MCP server 代码（`src/mcp-servers/*/`）独立维护，不依赖主进程模块
- **崩溃隔离**：一个 MCP server crash 不影响主进程和其他 server
- **与 fyllo-spawn 一致**：fyllo-spawn 需要 IPC channel 与主进程通信，也是子进程模型

### 启动流程

```
主进程 app ready
  → 对每个 bundled MCP server：
    → 生成 bearer token
    → spawn 子进程，env 中传入 FYLLO_MCP_TRANSPORT=http, FYLLO_MCP_AUTH_TOKEN=<token>, 进程级固定参数
    → 子进程内：启动 McpServer + StreamableHTTPServerTransport，listen(0, "127.0.0.1")
    → 子进程通过 IPC 回报 { type: "ready", port }
    → 主进程记录 name → { url, token } 映射
```

### 安全

- 绑定 `127.0.0.1`，仅本机可访问
- 主进程生成 bearer token，通过 spawn env 传给子进程
- agent 发请求时通过 `McpServerHttp.headers` 中的 `Authorization: Bearer <token>` 校验
- 子进程收到请求时验证 token，不匹配则 401

### 生命周期管理

- **健康检查 & 重启**：监听子进程 `exit` 事件，非正常退出时自动重启，更新端口映射
- **关闭**：app quit 时 kill 所有子进程
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

| 环境变量                 | HTTP Header                | 生命周期   |
| ------------------------ | -------------------------- | ---------- |
| `FYLLO_PROJECT_PATH`     | `X-Fyllo-Project-Path`     | 按 project |
| `FYLLO_PROJECT_DATA_DIR` | `X-Fyllo-Project-Data-Dir` | 按 project |
| `FYLLO_MCP_EVENT_DIR`    | `X-Fyllo-Mcp-Event-Dir`    | 按 project |
| `FYLLO_SESSION_ID`       | `X-Fyllo-Session-Id`       | 按 session |

ACP 的 `McpServerHttp.headers` 声明这些 headers，agent 在每次 MCP 请求中自动携带。

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

通用 headers（`X-Fyllo-Project-Path` 等）映射到具名字段。不在已知列表中的 `X-Fyllo-*` headers 收入 `extras`，为未来扩展预留空间。

HTTP handler 在收到请求时：

```
解析 X-Fyllo-* headers → 构建 RequestContext → AsyncLocalStorage.run(ctx, handleRequest)
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

根据 agent 能力，`getBundledMcpServers()` 返回不同类型的 spec：

- 支持 HTTP 的 agent → 返回 `McpServerSpecHttp[]`（URL + headers）
- 不支持 HTTP 的 agent → 返回 `McpServerSpecStdio[]`（command + args + env，现有逻辑）

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

export async function startServer(signal?: AbortSignal): Promise<void> {
  const server = new McpServer({ name: "fyllo-specs", version: FYLLO_SPECS_SERVER_VERSION });
  registerTools(server);

  if (process.env.FYLLO_MCP_TRANSPORT === "http") {
    await startHttpMode(server, signal);
  } else {
    await startStdioMode(server, signal);
  }
}
```

`FYLLO_MCP_TRANSPORT` 由 `bundled-mcp-host.ts` 在 spawn 时通过 env 设定。现有的 stdio 路径（agent 自己 fork MCP server）不设置此变量，默认走 stdio。

### HTTP 模式实现

HTTP 启动逻辑提取为 `src/mcp-servers/shared/http-server.ts` 共享模块：

```typescript
// src/mcp-servers/shared/http-server.ts

import { createServer } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseRequestContext, runWithContext } from "./request-context";

export async function startHttpMode(server: McpServer, signal?: AbortSignal): Promise<void> {
  const token = process.env.FYLLO_MCP_AUTH_TOKEN;

  const httpServer = createServer(async (req, res) => {
    // 验证 bearer token
    const auth = req.headers.authorization;
    if (token && auth !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end();
      return;
    }

    // 解析请求上下文
    const ctx = parseRequestContext(req.headers);

    // stateless transport：无 MCP session 管理
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await runWithContext(ctx, () => transport.handleRequest(req, res));
  });

  httpServer.listen(0, "127.0.0.1", () => {
    const addr = httpServer.address() as import("net").AddressInfo;
    // 通过 IPC 通知主进程
    process.send?.({ type: "ready", port: addr.port });
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

    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value === undefined) continue;

    const knownField = KNOWN_HEADERS[key];
    if (knownField) {
      (ctx as Record<string, unknown>)[knownField] = value;
    } else {
      // 去掉 x-fyllo- 前缀存入 extras
      const extraKey = key.slice("x-fyllo-".length);
      ctx.extras[extraKey] = value;
    }
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

// 管理 bundled MCP server 子进程的生命周期
// 职责：spawn、端口记录、token 分配、健康检查、重启、关闭

interface ManagedMcpServer {
  name: string;
  process: ChildProcess;
  port: number;
  token: string;
}

const managedServers = new Map<string, ManagedMcpServer>();

// app ready 时调用
export async function startBundledMcpServers(): Promise<void>;

// 查询某个 MCP server 的 URL 和 token
export function getMcpServerEndpoint(name: string): { url: string; token: string };

// app quit 时调用
export function stopBundledMcpServers(): void;
```

### bundled-mcp-servers.ts 改造

```typescript
// src/main/infra/mcp/bundled-mcp-servers.ts

export function getBundledMcpServers(opts: {
  projectPath: string;
  fylloSessionId?: string;
  supportsHttp: boolean;
}): McpServerSpec[] {
  if (process.env.FYLLO_DISABLE_BUNDLED_MCP === "1") {
    return [];
  }

  if (opts.supportsHttp) {
    return buildHttpSpecs(opts);
  }
  return buildStdioSpecs(opts);
}

function buildHttpSpecs(opts: {
  projectPath: string;
  fylloSessionId?: string;
}): McpServerSpecHttp[] {
  return bundledMcpServers.map((server) => {
    const { url, token } = getMcpServerEndpoint(server.name);
    return {
      type: "http",
      name: server.name,
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Fyllo-Project-Path": opts.projectPath,
        "X-Fyllo-Project-Data-Dir": projectDir(opts.projectPath),
        "X-Fyllo-Mcp-Event-Dir": mcpEventsDir(opts.projectPath),
        "X-Fyllo-Mcp-Telemetry": "0",
        ...(opts.fylloSessionId ? { "X-Fyllo-Session-Id": opts.fylloSessionId } : {}),
      },
    };
  });
}

function buildStdioSpecs(opts: {
  projectPath: string;
  fylloSessionId?: string;
}): McpServerSpecStdio[] {
  // 现有逻辑，保持不变
  return bundledMcpServers.map((server) => ({
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
  }));
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

`prepareStartContext` 中获取 agent 的 HTTP 能力，传给 `getBundledMcpServers`：

```typescript
private async prepareStartContext(): Promise<StartContext | null> {
  const entry = await this.getProcessEntry();
  if (!entry) return null;

  const supportsHttp =
    entry.initializeResponse.agentCapabilities?.mcpCapabilities?.http === true;

  const mcpServers = getBundledMcpServers({
    projectPath: this.opts.projectPath,
    fylloSessionId: this.opts.fylloSessionId,
    supportsHttp,
  }).map(toAcpMcpServer);

  // ... 后续不变
}
```

`session-probe-service.ts` 中 `ensureProbe` 同理。

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
| `src/main/infra/mcp/bundled-mcp-host.ts`                  | **新增** | 管理 MCP server 子进程生命周期                                                                          |
| `src/main/infra/mcp/bundled-mcp-servers.ts`               | 修改     | 拆分 stdio/http 构建路径；新增 `toAcpMcpServer()`；`BundledMcpServerRegistration.env` 改为 `processEnv` |
| `src/main/services/session/chat/acp-session.ts`           | 修改     | `prepareStartContext` 检测 HTTP 能力，调用新接口                                                        |
| `src/main/services/session/chat/session-probe-service.ts` | 修改     | `ensureProbe` 同上                                                                                      |
| `src/mcp-servers/shared/request-context.ts`               | **新增** | `AsyncLocalStorage` 请求上下文，含 `extras`                                                             |
| `src/mcp-servers/shared/http-server.ts`                   | **新增** | 共享 HTTP 启动逻辑                                                                                      |
| `src/mcp-servers/shared/env.ts`                           | **新增** | 统一 getter（双模兼容）                                                                                 |
| `src/mcp-servers/fyllo-specs/src/server.ts`               | 修改     | 双模式启动                                                                                              |
| `src/mcp-servers/fyllo-cortex/src/server.ts`              | 修改     | 双模式启动                                                                                              |
| `src/mcp-servers/fyllo-specs/src/tools/*.ts`              | 修改     | `process.env.FYLLO_*` → 统一 getter                                                                     |
| `src/mcp-servers/fyllo-specs/src/utils/*.ts`              | 修改     | 同上                                                                                                    |
| `src/mcp-servers/fyllo-cortex/src/tools/*.ts`             | 修改     | 同上                                                                                                    |
| `src/mcp-servers/fyllo-cortex/src/utils/*.ts`             | 修改     | 同上                                                                                                    |

## 实施顺序

1. **基础设施**：新增 `shared/request-context.ts`、`shared/env.ts`、`shared/http-server.ts`
2. **类型扩展**：修改 `McpServerSpec` 类型
3. **MCP server 改造**：tool handler 迁移到统一 getter（此步骤完成后 stdio 模式仍可工作，可独立验证）
4. **主进程 host**：新增 `bundled-mcp-host.ts`，app ready 时启动 HTTP 模式的 MCP server
5. **分流逻辑**：修改 `bundled-mcp-servers.ts`、`acp-session.ts`、`session-probe-service.ts`
6. **端到端验证**：用支持 HTTP 的 agent（Claude Code）验证 HTTP 路径；用不支持的 agent 验证 stdio fallback

## 待验证

- [ ] Claude Code ACP agent 的 `mcpCapabilities.http` 是否为 `true`
- [ ] Codex ACP agent 是否支持 HTTP MCP server
- [ ] `StreamableHTTPServerTransport` stateless 模式下，每次 `handleRequest` 前是否需要重新 `server.connect(transport)`，还是可以复用单个 transport 实例

import { randomBytes } from "node:crypto";
import {
  createServer,
  request as createProxyRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { ChildProcess, Serializable } from "node:child_process";
import spawn from "cross-spawn";
import logger from "@main/infra/logger";
import {
  FYLLO_SPAWN_RPC_PROTOCOL,
  FYLLO_SPAWN_RPC_VERSION,
  fylloSpawnRpcCancelSchema,
  fylloSpawnRpcRequestSchema,
  spawnRpcErrorCodeSchema,
  type FylloSpawnRpcRequest,
  type SpawnRpcError,
} from "@shared/types/fyllo-spawn-rpc";
import {
  FYLLO_WORKSPACE_CONTEXT_HEADER,
  serializeMcpWorkspaceDescriptor,
} from "@shared/types/mcp-workspace";
import { mcpAccessGrantRegistry } from "./mcp-access-grant-registry";
import {
  bundledMcpServers,
  resolveBundlePath,
  type BundledMcpServerName,
  type BundledMcpServerRegistration,
} from "./bundled-mcp-registry";

export const INITIAL_BACKEND_READY_TIMEOUT_MS = 3_000;
export const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BASE_DELAY_MS = 250;
const RESTART_MAX_DELAY_MS = 4_000;
const SHUTDOWN_GRACE_MS = 1_000;
const IS_WINDOWS = process.platform === "win32";

type ManagedMcpServerState = "starting" | "ready" | "restarting" | "failed";

interface ManagedMcpServer {
  registration: BundledMcpServerRegistration;
  process: ChildProcess | null;
  backendPort: number | null;
  state: ManagedMcpServerState;
  failures: number;
  restartTimer: NodeJS.Timeout | null;
  initialSettled: boolean;
  initialPromise: Promise<void>;
  settleInitial: () => void;
  generation: number;
}

interface BundledMcpHost {
  proxyServer: HttpServer | null;
  proxyPort: number | null;
  token: string | null;
  servers: Map<BundledMcpServerName, ManagedMcpServer>;
  initialTimer: NodeJS.Timeout | null;
  shuttingDown: boolean;
  unavailable: boolean;
  pendingRpc: Map<
    string,
    {
      child: ChildProcess;
      serverName: BundledMcpServerName;
      generation: number;
      controller: AbortController;
    }
  >;
}

export interface BundledMcpEndpoint {
  url: string;
}

export interface BundledMcpRpcEnvelope {
  protocol: string;
  version: number;
  kind: "request" | "cancel";
  requestId: string;
}

export interface BundledMcpRpcCodec<TRequest> {
  parseRequest(input: unknown): TRequest | null;
  parseCancel(input: unknown): Pick<BundledMcpRpcEnvelope, "requestId"> | null;
  success(requestId: string, result: unknown): unknown;
  failure(requestId: string, error: unknown): unknown;
  toError(error: unknown, signal: AbortSignal): unknown;
}

export type BundledMcpRpcHandler<TRequest = unknown> = (
  request: TRequest,
  signal: AbortSignal
) => Promise<unknown>;

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

let host: BundledMcpHost | null = null;
let startupPromise: Promise<void> | null = null;
let stopPromise: Promise<void> | null = null;

function toRpcError(error: unknown, signal: AbortSignal): SpawnRpcError {
  if (signal.aborted) {
    return { code: "SPAWN_RPC_CANCELLED", message: "RPC request was cancelled" };
  }
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown; retryable?: unknown };
    const code = spawnRpcErrorCodeSchema.safeParse(candidate.code);
    if (code.success) {
      return {
        code: code.data,
        message:
          typeof candidate.message === "string" && candidate.message
            ? candidate.message
            : "Bundled MCP RPC failed",
        ...(typeof candidate.retryable === "boolean" ? { retryable: candidate.retryable } : {}),
      };
    }
  }
  return {
    code: "SPAWN_INTERNAL_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

const fylloSpawnRpcCodec: BundledMcpRpcCodec<FylloSpawnRpcRequest> = {
  parseRequest(input) {
    const parsed = fylloSpawnRpcRequestSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  },
  parseCancel(input) {
    const parsed = fylloSpawnRpcCancelSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  },
  success(requestId, result) {
    return {
      protocol: FYLLO_SPAWN_RPC_PROTOCOL,
      version: FYLLO_SPAWN_RPC_VERSION,
      kind: "response",
      requestId,
      ok: true,
      result,
    };
  },
  failure(requestId, error) {
    return {
      protocol: FYLLO_SPAWN_RPC_PROTOCOL,
      version: FYLLO_SPAWN_RPC_VERSION,
      kind: "response",
      requestId,
      ok: false,
      error,
    };
  },
  toError: toRpcError,
};

interface RegisteredRpcHandler {
  codec: BundledMcpRpcCodec<unknown>;
  handler?: BundledMcpRpcHandler<unknown>;
}

const rpcHandlers = new Map<BundledMcpServerName, RegisteredRpcHandler>([
  ["fyllo-spawn", { codec: fylloSpawnRpcCodec as BundledMcpRpcCodec<unknown> }],
]);

function createManagedServer(registration: BundledMcpServerRegistration): ManagedMcpServer {
  let settleInitial!: () => void;
  const initialPromise = new Promise<void>((resolve) => {
    settleInitial = resolve;
  });
  return {
    registration,
    process: null,
    backendPort: null,
    state: "starting",
    failures: 0,
    restartTimer: null,
    initialSettled: false,
    initialPromise,
    settleInitial,
    generation: 0,
  };
}

export function registerBundledMcpRpcHandler(
  serverName: "fyllo-spawn",
  handler: BundledMcpRpcHandler<FylloSpawnRpcRequest>
): () => void;
export function registerBundledMcpRpcHandler<TRequest>(
  serverName: BundledMcpServerName,
  handler: BundledMcpRpcHandler<TRequest>,
  codec: BundledMcpRpcCodec<TRequest>
): () => void;
export function registerBundledMcpRpcHandler<TRequest>(
  serverName: BundledMcpServerName,
  handler: BundledMcpRpcHandler<TRequest>,
  codec?: BundledMcpRpcCodec<TRequest>
): () => void {
  const current = rpcHandlers.get(serverName);
  if (current?.handler) {
    throw new Error(`Bundled MCP RPC handler already registered: ${serverName}`);
  }
  if (!codec && !current) {
    throw new Error(`Bundled MCP RPC codec is not registered: ${serverName}`);
  }
  rpcHandlers.set(serverName, {
    codec: (codec ?? current?.codec) as BundledMcpRpcCodec<unknown>,
    handler: handler as BundledMcpRpcHandler<unknown>,
  });
  return () => {
    const registered = rpcHandlers.get(serverName);
    if (registered?.handler === handler) {
      if (serverName === "fyllo-spawn") {
        rpcHandlers.set(serverName, { codec: fylloSpawnRpcCodec as BundledMcpRpcCodec<unknown> });
      } else {
        rpcHandlers.delete(serverName);
      }
    }
  };
}

function settleInitial(managed: ManagedMcpServer): void {
  if (managed.initialSettled) {
    return;
  }
  managed.initialSettled = true;
  managed.settleInitial();
}

function filteredResponseHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !hopByHopHeaders.has(name.toLowerCase()))
  );
}

function filteredCallerHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const normalized = name.toLowerCase();
      return (
        !hopByHopHeaders.has(normalized) &&
        normalized !== "authorization" &&
        !normalized.startsWith("x-fyllo-")
      );
    })
  );
}

function bearerToken(headers: IncomingHttpHeaders): string | null {
  const authorization = headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length);
  return token ? token : null;
}

function writeProxyError(res: ServerResponse, statusCode: number, message: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function handleProxyRequest(
  currentHost: BundledMcpHost,
  incoming: IncomingMessage,
  res: ServerResponse
): void {
  const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
  const requestedName = url.pathname.startsWith("/mcp/") ? url.pathname.slice("/mcp/".length) : "";
  const registration = bundledMcpServers.find((server) => server.name === requestedName);
  if (!registration) {
    writeProxyError(res, 404, "Unknown bundled MCP server");
    return;
  }

  const name = registration.name;
  const token = bearerToken(incoming.headers);
  const authorization = token
    ? mcpAccessGrantRegistry.authorize(token, name)
    : { status: "unauthorized" as const, reason: "missing-token" as const };
  if (authorization.status === "unauthorized") {
    logger.warn(
      `[bundled-mcp-host] proxy authorization rejected server=${name} reason=${authorization.reason}`
    );
    writeProxyError(res, 401, "Unauthorized");
    return;
  }
  if (authorization.status === "forbidden") {
    writeProxyError(res, 403, "Forbidden");
    return;
  }
  if (!currentHost.token) {
    writeProxyError(res, 503, "Bundled MCP host is unavailable");
    return;
  }

  const managed = currentHost.servers.get(name);
  if (!managed || managed.state !== "ready" || managed.backendPort === null) {
    res.setHeader("Retry-After", "1");
    writeProxyError(res, 503, "Bundled MCP server is unavailable");
    return;
  }

  const upstream = createProxyRequest(
    {
      hostname: "127.0.0.1",
      port: managed.backendPort,
      method: incoming.method,
      path: `/mcp${url.search}`,
      headers: {
        ...filteredCallerHeaders(incoming.headers),
        Authorization: `Bearer ${currentHost.token}`,
        [FYLLO_WORKSPACE_CONTEXT_HEADER]: Buffer.from(
          serializeMcpWorkspaceDescriptor(authorization.grant.descriptor),
          "utf8"
        ).toString("base64url"),
      },
    },
    (upstreamResponse) => {
      if (res.destroyed) {
        upstreamResponse.destroy();
        return;
      }
      res.writeHead(
        upstreamResponse.statusCode ?? 502,
        filteredResponseHeaders(upstreamResponse.headers)
      );
      upstreamResponse.pipe(res);
    }
  );

  upstream.once("error", (error) => {
    logger.warn(`[bundled-mcp-host] proxy request failed for ${name}`, error);
    writeProxyError(res, 502, "Bundled MCP backend request failed");
  });
  incoming.once("aborted", () => upstream.destroy());
  incoming.pipe(upstream);
}

async function listenProxy(currentHost: BundledMcpHost): Promise<void> {
  const proxyServer = createServer((req, res) => {
    handleProxyRequest(currentHost, req, res);
  });
  currentHost.proxyServer = proxyServer;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      proxyServer.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      proxyServer.off("error", onError);
      resolve();
    };
    proxyServer.once("error", onError);
    proxyServer.once("listening", onListening);
    proxyServer.listen(0, "127.0.0.1");
  });

  const address = proxyServer.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Bundled MCP proxy did not expose a listening address");
  }
  currentHost.proxyPort = address.port;
  logger.info(`[bundled-mcp-host] proxy ready url=http://127.0.0.1:${address.port}`);
}

function restartDelay(failures: number): number {
  return Math.min(RESTART_BASE_DELAY_MS * 2 ** Math.max(0, failures - 1), RESTART_MAX_DELAY_MS);
}

function scheduleRestart(currentHost: BundledMcpHost, managed: ManagedMcpServer): void {
  if (currentHost.shuttingDown || managed.restartTimer) {
    return;
  }
  if (managed.failures >= MAX_RESTART_ATTEMPTS) {
    managed.state = "failed";
    settleInitial(managed);
    return;
  }

  managed.state = "restarting";
  const timer = setTimeout(() => {
    managed.restartTimer = null;
    spawnBackend(currentHost, managed);
  }, restartDelay(managed.failures));
  timer.unref();
  managed.restartTimer = timer;
}

function sendRpcResponse(child: ChildProcess, response: unknown): void {
  if (!child.connected || !child.send) return;
  child.send(response as Serializable, (error) => {
    if (error) {
      logger.warn(
        `[bundled-mcp-host] failed to send RPC response requestId=${
          typeof response === "object" && response !== null && "requestId" in response
            ? String(response.requestId)
            : "unknown"
        }`,
        error
      );
    }
  });
}

function abortPendingRpc(
  currentHost: BundledMcpHost,
  child?: ChildProcess,
  generation?: number
): void {
  for (const [requestId, pending] of currentHost.pendingRpc) {
    if (child && pending.child !== child) continue;
    if (generation !== undefined && pending.generation !== generation) continue;
    pending.controller.abort();
    currentHost.pendingRpc.delete(requestId);
  }
}

function handleRpcRequest(
  currentHost: BundledMcpHost,
  managed: ManagedMcpServer,
  child: ChildProcess,
  generation: number,
  request: unknown,
  registration: RegisteredRpcHandler
): void {
  const requestId =
    typeof request === "object" && request !== null && "requestId" in request
      ? String(request.requestId)
      : "";
  if (!requestId) return;
  if (currentHost.pendingRpc.has(requestId)) {
    sendRpcResponse(
      child,
      registration.codec.failure(requestId, {
        code: "SPAWN_INVALID_REQUEST",
        message: "Duplicate RPC requestId",
      })
    );
    return;
  }

  if (!registration.handler) {
    sendRpcResponse(
      child,
      registration.codec.failure(requestId, {
        code: "SPAWN_RPC_UNAVAILABLE",
        message: "RPC handler is unavailable",
        retryable: true,
      })
    );
    return;
  }

  const controller = new AbortController();
  currentHost.pendingRpc.set(requestId, {
    child,
    serverName: managed.registration.name,
    generation,
    controller,
  });
  void registration
    .handler(request, controller.signal)
    .then((result) => {
      if (
        managed.process !== child ||
        managed.generation !== generation ||
        controller.signal.aborted
      ) {
        return;
      }
      sendRpcResponse(child, registration.codec.success(requestId, result));
    })
    .catch((error: unknown) => {
      if (managed.process !== child || managed.generation !== generation) return;
      sendRpcResponse(
        child,
        registration.codec.failure(requestId, registration.codec.toError(error, controller.signal))
      );
    })
    .finally(() => {
      const current = currentHost.pendingRpc.get(requestId);
      if (current?.child === child && current.generation === generation) {
        currentHost.pendingRpc.delete(requestId);
      }
    });
}

function spawnBackend(currentHost: BundledMcpHost, managed: ManagedMcpServer): void {
  if (currentHost.shuttingDown || !currentHost.token) {
    return;
  }

  const child = spawn(process.execPath, [resolveBundlePath(managed.registration.name)], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FYLLO_MCP_TRANSPORT: "http",
      FYLLO_MCP_AUTH_TOKEN: currentHost.token,
      FYLLO_MCP_TELEMETRY: "0",
      ...(managed.registration.processEnv?.() ?? {}),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    detached: !IS_WINDOWS,
  });
  managed.process = child;
  managed.generation += 1;
  const generation = managed.generation;
  managed.backendPort = null;
  managed.state = managed.failures === 0 ? "starting" : "restarting";
  logger.info(
    `[bundled-mcp-host] spawned server=${managed.registration.name} pid=${child.pid ?? "unknown"}`
  );

  child.stdout?.on("data", (chunk: Buffer | string) => {
    logger.info(`[bundled-mcp-host:${managed.registration.name}] ${String(chunk).trimEnd()}`);
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    logger.warn(`[bundled-mcp-host:${managed.registration.name}] ${String(chunk).trimEnd()}`);
  });

  let terminated = false;
  const handleTermination = (reason: unknown): void => {
    if (terminated || managed.process !== child) {
      return;
    }
    terminated = true;
    abortPendingRpc(currentHost, child, generation);
    managed.process = null;
    managed.backendPort = null;
    if (currentHost.shuttingDown) {
      return;
    }
    managed.failures += 1;
    logger.warn(
      `[bundled-mcp-host] ${managed.registration.name} exited; attempt=${managed.failures}`,
      reason
    );
    scheduleRestart(currentHost, managed);
  };

  child.on("message", (message: unknown) => {
    if (managed.process !== child || managed.generation !== generation) return;

    if (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: unknown }).type === "ready"
    ) {
      const port = (message as { port?: unknown }).port;
      if (!Number.isInteger(port) || (port as number) <= 0 || (port as number) > 65_535) return;
      const backendPort = port as number;
      managed.backendPort = backendPort;
      managed.state = "ready";
      const proxyUrl =
        currentHost.proxyPort === null
          ? "unavailable"
          : `http://127.0.0.1:${currentHost.proxyPort}/mcp/${managed.registration.name}`;
      logger.info(
        `[bundled-mcp-host] server ready name=${managed.registration.name} backend=http://127.0.0.1:${backendPort}/mcp proxy=${proxyUrl}`
      );
      settleInitial(managed);
      return;
    }

    const registration = rpcHandlers.get(managed.registration.name);
    if (!registration) {
      return;
    }
    const request = registration.codec.parseRequest(message);
    if (request) {
      handleRpcRequest(currentHost, managed, child, generation, request, registration);
      return;
    }
    const cancel = registration.codec.parseCancel(message);
    if (cancel) {
      const pending = currentHost.pendingRpc.get(cancel.requestId);
      if (pending?.child === child && pending.generation === generation) {
        pending.controller.abort();
        currentHost.pendingRpc.delete(cancel.requestId);
      }
    }
  });
  child.once("disconnect", () => {
    handleTermination({ reason: "ipc-disconnect" });
    child.kill("SIGTERM");
  });
  child.once("error", handleTermination);
  child.once("exit", (code, signal) => handleTermination({ code, signal }));
}

async function startHost(currentHost: BundledMcpHost): Promise<void> {
  if (process.env.FYLLO_DISABLE_BUNDLED_MCP === "1") {
    return;
  }

  try {
    const token = randomBytes(32).toString("base64url");
    if (!token) {
      throw new Error("Failed to generate bundled MCP auth token");
    }
    currentHost.token = token;
    await listenProxy(currentHost);
    if (currentHost.shuttingDown) {
      return;
    }

    for (const managed of currentHost.servers.values()) {
      spawnBackend(currentHost, managed);
    }

    const timer = setTimeout(() => {
      currentHost.initialTimer = null;
      for (const managed of currentHost.servers.values()) {
        if (!managed.initialSettled) {
          if (managed.state === "starting") {
            managed.state = "restarting";
          }
          settleInitial(managed);
        }
      }
    }, INITIAL_BACKEND_READY_TIMEOUT_MS);
    timer.unref();
    currentHost.initialTimer = timer;

    await Promise.all([...currentHost.servers.values()].map((managed) => managed.initialPromise));
    if (currentHost.initialTimer) {
      clearTimeout(currentHost.initialTimer);
      currentHost.initialTimer = null;
    }
  } catch (error: unknown) {
    currentHost.unavailable = true;
    currentHost.token = null;
    for (const managed of currentHost.servers.values()) {
      managed.state = "failed";
      settleInitial(managed);
    }
    logger.error("[bundled-mcp-host] startup failed; stdio fallback remains available", error);
  }
}

export function startBundledMcpHost(): void {
  if (startupPromise) {
    return;
  }

  const servers = new Map<BundledMcpServerName, ManagedMcpServer>(
    bundledMcpServers.map((registration) => [registration.name, createManagedServer(registration)])
  );
  host = {
    proxyServer: null,
    proxyPort: null,
    token: null,
    servers,
    initialTimer: null,
    shuttingDown: false,
    unavailable: false,
    pendingRpc: new Map(),
  };
  startupPromise = startHost(host);
}

export async function waitForBundledMcpInitialReadiness(): Promise<void> {
  await startupPromise;
}

export function getMcpServerEndpoint(name: BundledMcpServerName): BundledMcpEndpoint | null {
  if (
    !host ||
    host.unavailable ||
    host.proxyPort === null ||
    !host.token ||
    host.servers.get(name)?.state !== "ready"
  ) {
    return null;
  }
  return {
    url: `http://127.0.0.1:${host.proxyPort}/mcp/${name}`,
  };
}

async function closeProxy(proxyServer: HttpServer | null): Promise<void> {
  if (!proxyServer?.listening) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve();
    };
    proxyServer.close(finish);
    timer = setTimeout(() => {
      proxyServer.closeAllConnections();
      finish();
    }, SHUTDOWN_GRACE_MS);
    timer.unref();
  });
}

async function forceTerminate(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }
  if (IS_WINDOWS) {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        detached: true,
      });
      killer.unref();
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      logger.warn(`[bundled-mcp-host] failed to kill process group ${pid}`, error);
    }
  }
}

export function beginBundledMcpHostShutdown(): void {
  const currentHost = host;
  if (!currentHost || currentHost.shuttingDown) return;
  currentHost.shuttingDown = true;
  mcpAccessGrantRegistry.revokeAll("host-stopped");
  if (currentHost.initialTimer) {
    clearTimeout(currentHost.initialTimer);
    currentHost.initialTimer = null;
  }
  abortPendingRpc(currentHost);
  for (const managed of currentHost.servers.values()) {
    if (managed.restartTimer) {
      clearTimeout(managed.restartTimer);
      managed.restartTimer = null;
    }
    settleInitial(managed);
  }
}

async function stopCurrentHost(currentHost: BundledMcpHost): Promise<void> {
  beginBundledMcpHostShutdown();

  await startupPromise;
  await closeProxy(currentHost.proxyServer);

  const children = [...currentHost.servers.values()]
    .map((managed) => managed.process)
    .filter((child): child is ChildProcess => child !== null);
  for (const child of children) {
    child.kill("SIGTERM");
  }

  await Promise.race([
    Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolve();
              return;
            }
            child.once("exit", () => resolve());
          })
      )
    ),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
      timer.unref();
    }),
  ]);

  await Promise.all(
    children
      .filter((child) => child.exitCode === null && child.signalCode === null)
      .map(forceTerminate)
  );

  for (const managed of currentHost.servers.values()) {
    managed.process = null;
    managed.backendPort = null;
    managed.state = "failed";
  }
  currentHost.pendingRpc.clear();
  currentHost.proxyServer = null;
  currentHost.proxyPort = null;
  currentHost.token = null;
}

export async function stopBundledMcpHost(): Promise<void> {
  if (!host) {
    return;
  }
  stopPromise ??= stopCurrentHost(host).finally(() => {
    host = null;
    startupPromise = null;
    stopPromise = null;
  });
  await stopPromise;
}

function forceTerminateImmediately(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  const pid = child.pid;
  if (IS_WINDOWS) {
    try {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        detached: true,
      });
      killer.unref();
    } catch (error: unknown) {
      logger.warn(`[bundled-mcp-host] emergency taskkill failed for pid=${pid}`, error);
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      logger.warn(`[bundled-mcp-host] emergency SIGKILL failed for pgid=${pid}`, error);
    }
  }
}

async function confirmMcpProcessTreeExit(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 100);
      timer.unref();
    });
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (!IS_WINDOWS) {
      try {
        process.kill(-child.pid, 0);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      }
    }
    forceTerminateImmediately(child);
  }
}

export async function forceStopBundledMcpHost(): Promise<void> {
  const currentHost = host;
  if (!currentHost) return;
  beginBundledMcpHostShutdown();
  currentHost.proxyServer?.closeAllConnections();
  currentHost.proxyServer?.close();
  const children: ChildProcess[] = [];
  for (const managed of currentHost.servers.values()) {
    if (managed.process) {
      children.push(managed.process);
      forceTerminateImmediately(managed.process);
    }
    managed.process = null;
    managed.backendPort = null;
    managed.state = "failed";
  }
  await Promise.all(children.map(confirmMcpProcessTreeExit));
}

export function getBundledMcpProcessIds(): number[] {
  if (!host) return [];
  return [...host.servers.values()]
    .map((managed) => managed.process?.pid)
    .filter((pid): pid is number => pid !== undefined);
}

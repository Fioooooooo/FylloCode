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
import type { ChildProcess } from "node:child_process";
import spawn from "cross-spawn";
import logger from "@main/infra/logger";
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
}

interface BundledMcpHost {
  proxyServer: HttpServer | null;
  proxyPort: number | null;
  token: string | null;
  servers: Map<BundledMcpServerName, ManagedMcpServer>;
  initialTimer: NodeJS.Timeout | null;
  shuttingDown: boolean;
  unavailable: boolean;
}

export interface BundledMcpEndpoint {
  url: string;
  token: string;
}

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
  };
}

function settleInitial(managed: ManagedMcpServer): void {
  if (managed.initialSettled) {
    return;
  }
  managed.initialSettled = true;
  managed.settleInitial();
}

function filteredHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !hopByHopHeaders.has(name.toLowerCase()))
  );
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
  const match = /^\/mcp\/(fyllo-specs|fyllo-cortex)$/.exec(url.pathname);
  if (!match) {
    writeProxyError(res, 404, "Unknown bundled MCP server");
    return;
  }

  const name = match[1] as BundledMcpServerName;
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
      headers: filteredHeaders(incoming.headers),
    },
    (upstreamResponse) => {
      if (res.destroyed) {
        upstreamResponse.destroy();
        return;
      }
      res.writeHead(upstreamResponse.statusCode ?? 502, filteredHeaders(upstreamResponse.headers));
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
    if (
      managed.process !== child ||
      typeof message !== "object" ||
      message === null ||
      (message as { type?: unknown }).type !== "ready"
    ) {
      return;
    }
    const port = (message as { port?: unknown }).port;
    if (!Number.isInteger(port) || (port as number) <= 0 || (port as number) > 65_535) {
      return;
    }
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
    token: host.token,
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
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
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

async function stopCurrentHost(currentHost: BundledMcpHost): Promise<void> {
  currentHost.shuttingDown = true;
  if (currentHost.initialTimer) {
    clearTimeout(currentHost.initialTimer);
    currentHost.initialTimer = null;
  }
  for (const managed of currentHost.servers.values()) {
    if (managed.restartTimer) {
      clearTimeout(managed.restartTimer);
      managed.restartTimer = null;
    }
    settleInitial(managed);
  }

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

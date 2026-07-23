import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    if (this.exitCode !== null || this.signalCode !== null) {
      return false;
    }
    this.signalCode = signal;
    queueMicrotask(() => this.emit("exit", null, signal));
    return true;
  }
}

const spawnMocks = vi.hoisted(() => ({
  calls: [] as Array<{ args: string[]; child: FakeChild }>,
  nextPid: 20_000,
  spawn: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("cross-spawn", () => ({
  default: spawnMocks.spawn,
}));

vi.mock("@main/infra/logger", () => ({
  default: loggerMocks,
}));

import {
  getMcpServerEndpoint,
  INITIAL_BACKEND_READY_TIMEOUT_MS,
  MAX_RESTART_ATTEMPTS,
  startBundledMcpHost,
  stopBundledMcpHost,
  waitForBundledMcpInitialReadiness,
} from "@main/infra/mcp/bundled-mcp-host";

const backendServers: Server[] = [];
const originalDisable = process.env.FYLLO_DISABLE_BUNDLED_MCP;

function childFor(name: "fyllo-specs" | "fyllo-cortex", index = 0): FakeChild {
  const matches = spawnMocks.calls.filter((call) => call.args[0]?.includes(name));
  const child = matches[index]?.child;
  if (!child) {
    throw new Error(`Missing fake child for ${name} at index ${index}`);
  }
  return child;
}

async function waitForChildCount(count: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (spawnMocks.calls.length >= count) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Expected ${count} child processes, got ${spawnMocks.calls.length}`);
}

async function startBackend(name: string): Promise<number> {
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-Backend-Name": name,
      });
      res.end(
        JSON.stringify({
          name,
          path: req.url,
          body,
          authorization: req.headers.authorization ?? null,
          projectPath: req.headers["x-fyllo-project-path"] ?? null,
        })
      );
    });
  });
  backendServers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  return (server.address() as AddressInfo).port;
}

async function closeBackendServers(): Promise<void> {
  await Promise.all(
    backendServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
}

beforeEach(() => {
  spawnMocks.calls.length = 0;
  spawnMocks.nextPid = 20_000;
  spawnMocks.spawn.mockImplementation((_command: string, args: string[]) => {
    const child = new FakeChild(spawnMocks.nextPid++);
    spawnMocks.calls.push({ args, child });
    return child as unknown as ChildProcess;
  });
  delete process.env.FYLLO_DISABLE_BUNDLED_MCP;
});

afterEach(async () => {
  await stopBundledMcpHost();
  await closeBackendServers();
  vi.useRealTimers();
  vi.clearAllMocks();
  if (originalDisable === undefined) {
    delete process.env.FYLLO_DISABLE_BUNDLED_MCP;
  } else {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = originalDisable;
  }
});

describe("bundled MCP host", () => {
  it("keeps one random proxy URL while routing names to independent backend ports", async () => {
    const specsPort = await startBackend("specs");
    const cortexPort = await startBackend("cortex");

    startBundledMcpHost();
    await waitForChildCount(2);
    childFor("fyllo-specs").emit("message", { type: "ready", port: specsPort });
    childFor("fyllo-cortex").emit("message", { type: "ready", port: cortexPort });
    await waitForBundledMcpInitialReadiness();

    const specsEndpoint = getMcpServerEndpoint("fyllo-specs");
    const cortexEndpoint = getMcpServerEndpoint("fyllo-cortex");
    expect(specsEndpoint).not.toBeNull();
    expect(cortexEndpoint).not.toBeNull();
    expect(new URL(specsEndpoint!.url).port).toBe(new URL(cortexEndpoint!.url).port);
    expect(specsEndpoint!.url).toMatch(/\/mcp\/fyllo-specs$/);
    expect(cortexEndpoint!.url).toMatch(/\/mcp\/fyllo-cortex$/);
    expect(specsEndpoint!.token).toBe(cortexEndpoint!.token);

    const proxyUrl = new URL(specsEndpoint!.url).origin;
    expect(loggerMocks.info).toHaveBeenCalledWith(`[bundled-mcp-host] proxy ready url=${proxyUrl}`);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      "[bundled-mcp-host] spawned server=fyllo-specs pid=20000"
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      "[bundled-mcp-host] spawned server=fyllo-cortex pid=20001"
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `[bundled-mcp-host] server ready name=fyllo-specs backend=http://127.0.0.1:${specsPort}/mcp proxy=${specsEndpoint!.url}`
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `[bundled-mcp-host] server ready name=fyllo-cortex backend=http://127.0.0.1:${cortexPort}/mcp proxy=${cortexEndpoint!.url}`
    );
    expect(loggerMocks.info.mock.calls.flat().join("\n")).not.toContain(specsEndpoint!.token);

    const [specsResponse, cortexResponse] = await Promise.all([
      fetch(specsEndpoint!.url, {
        method: "POST",
        body: "specs-body",
        headers: {
          Authorization: "Bearer forwarded-token",
          "X-Fyllo-Project-Path": "encoded-project",
        },
      }),
      fetch(cortexEndpoint!.url, { method: "POST", body: "cortex-body" }),
    ]);
    await expect(specsResponse.json()).resolves.toEqual({
      name: "specs",
      path: "/mcp",
      body: "specs-body",
      authorization: "Bearer forwarded-token",
      projectPath: "encoded-project",
    });
    await expect(cortexResponse.json()).resolves.toEqual({
      name: "cortex",
      path: "/mcp",
      body: "cortex-body",
      authorization: null,
      projectPath: null,
    });
  });

  it("returns 404 for unknown routes and 503 for a known unavailable backend", async () => {
    const specsPort = await startBackend("specs");
    startBundledMcpHost();
    await waitForChildCount(2);
    childFor("fyllo-specs").emit("message", { type: "ready", port: specsPort });
    childFor("fyllo-cortex").emit("message", { type: "ready", port: 65_000 });
    await waitForBundledMcpInitialReadiness();

    const specsEndpoint = getMcpServerEndpoint("fyllo-specs")!;
    childFor("fyllo-cortex").emit("exit", 1, null);
    const baseUrl = new URL(specsEndpoint.url);
    const unavailable = await fetch(`${baseUrl.origin}/mcp/fyllo-cortex`);
    const unknown = await fetch(`${baseUrl.origin}/mcp/unknown`);

    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("1");
    expect(unknown.status).toBe(404);
  });

  it("keeps the proxy URL and token stable when a backend restarts on a new port", async () => {
    const firstPort = await startBackend("first");
    const secondPort = await startBackend("second");
    const cortexPort = await startBackend("cortex");
    startBundledMcpHost();
    await waitForChildCount(2);
    const firstChild = childFor("fyllo-specs");
    firstChild.emit("message", { type: "ready", port: firstPort });
    childFor("fyllo-cortex").emit("message", { type: "ready", port: cortexPort });
    await waitForBundledMcpInitialReadiness();

    const before = getMcpServerEndpoint("fyllo-specs")!;
    firstChild.emit("exit", 1, null);
    await new Promise((resolve) => setTimeout(resolve, 260));
    await waitForChildCount(3);
    childFor("fyllo-specs", 1).emit("message", { type: "ready", port: secondPort });
    const after = getMcpServerEndpoint("fyllo-specs")!;

    expect(after).toEqual(before);
    const response = await fetch(after.url, { method: "POST", body: "after-restart" });
    await expect(response.json()).resolves.toEqual({
      name: "second",
      path: "/mcp",
      body: "after-restart",
      authorization: null,
      projectPath: null,
    });
  });

  it("shares one readiness timeout and falls back without duplicate spawns", async () => {
    startBundledMcpHost();
    await waitForChildCount(2);
    vi.useFakeTimers();

    const firstWait = waitForBundledMcpInitialReadiness();
    const secondWait = waitForBundledMcpInitialReadiness();
    await vi.advanceTimersByTimeAsync(INITIAL_BACKEND_READY_TIMEOUT_MS);
    await expect(Promise.all([firstWait, secondWait])).resolves.toEqual([undefined, undefined]);

    expect(spawnMocks.calls).toHaveLength(2);
    expect(getMcpServerEndpoint("fyllo-specs")).toBeNull();
    expect(getMcpServerEndpoint("fyllo-cortex")).toBeNull();
  });

  it("stops restarting after the configured maximum attempts", async () => {
    startBundledMcpHost();
    await waitForChildCount(2);
    childFor("fyllo-specs").emit("message", { type: "ready", port: 60_001 });
    childFor("fyllo-cortex").emit("message", { type: "ready", port: 60_002 });
    await waitForBundledMcpInitialReadiness();
    vi.useFakeTimers();

    for (let index = 0; index < MAX_RESTART_ATTEMPTS; index += 1) {
      childFor("fyllo-specs", index).emit("exit", 1, null);
      await vi.runOnlyPendingTimersAsync();
    }

    expect(spawnMocks.calls.filter((call) => call.args[0]?.includes("fyllo-specs"))).toHaveLength(
      MAX_RESTART_ATTEMPTS
    );
    expect(getMcpServerEndpoint("fyllo-specs")).toBeNull();
  });

  it("honors disable mode and stops idempotently", async () => {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = "1";
    startBundledMcpHost();
    await waitForBundledMcpInitialReadiness();

    expect(spawnMocks.spawn).not.toHaveBeenCalled();
    expect(getMcpServerEndpoint("fyllo-specs")).toBeNull();
    await stopBundledMcpHost();
    await stopBundledMcpHost();
  });
});

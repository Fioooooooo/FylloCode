import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { mcpAccessGrantRegistry } from "@main/infra/mcp/mcp-access-grant-registry";
import {
  FYLLO_WORKSPACE_CONTEXT_HEADER,
  parseMcpWorkspaceDescriptor,
} from "@shared/types/mcp-workspace";
import {
  FYLLO_SPAWN_RPC_PROTOCOL,
  FYLLO_SPAWN_RPC_VERSION,
  type FylloSpawnRpcRequest,
} from "@shared/types/fyllo-spawn-rpc";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  connected = true;
  readonly sent: unknown[] = [];

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

  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    if (!this.connected) return false;
    this.sent.push(message);
    callback?.(null);
    return true;
  }
}

const spawnMocks = vi.hoisted(() => ({
  calls: [] as Array<{ args: string[]; child: FakeChild }>,
  nextPid: 20_000,
  spawn: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
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
  forceStopBundledMcpHost,
  getBundledMcpProcessIds,
  getMcpServerEndpoint,
  INITIAL_BACKEND_READY_TIMEOUT_MS,
  MAX_RESTART_ATTEMPTS,
  registerBundledMcpRpcHandler,
  startBundledMcpHost,
  stopBundledMcpHost,
  waitForBundledMcpInitialReadiness,
} from "@main/infra/mcp/bundled-mcp-host";

const backendServers: Server[] = [];
const rpcHandlerDisposers: Array<() => void> = [];
const originalDisable = process.env.FYLLO_DISABLE_BUNDLED_MCP;

function childFor(name: "fyllo-specs" | "fyllo-cortex" | "fyllo-spawn", index = 0): FakeChild {
  const matches = spawnMocks.calls.filter((call) =>
    call.args[0]?.includes(`/mcp-servers/${name}/`)
  );
  const child = matches[index]?.child;
  if (!child) {
    throw new Error(`Missing fake child for ${name} at index ${index}`);
  }
  return child;
}

async function startHostAndReadySpawn(): Promise<void> {
  startBundledMcpHost();
  await waitForChildCount(3);
  childFor("fyllo-spawn").emit("message", { type: "ready", port: 65_003 });
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
          callerContext: req.headers["x-fyllo-caller-context"] ?? null,
          workspaceContext: req.headers[FYLLO_WORKSPACE_CONTEXT_HEADER] ?? null,
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

function issueToken(
  allowedServerNames: Array<"fyllo-specs" | "fyllo-cortex" | "fyllo-spawn">
): string {
  const folderPath = resolve("/work/project");
  return mcpAccessGrantRegistry.issue({
    agentId: "agent-1",
    descriptor: parseMcpWorkspaceDescriptor({
      version: 2,
      workspaceId: "workspace-1",
      workspaceKind: "folder",
      primaryFolderId: "folder-1",
      folders: [{ folderId: "folder-1", folderName: "Project", folderPath }],
      workspaceDataDir: resolve("/data/workspace-1"),
      sessionId: "session-1",
    }),
    allowedServerNames,
  }).token;
}

function decodeWorkspaceContext(value: unknown): unknown {
  if (typeof value !== "string") {
    return null;
  }
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

function rpcRequest(requestId: string, prompt = "inspect"): FylloSpawnRpcRequest {
  return {
    protocol: FYLLO_SPAWN_RPC_PROTOCOL,
    version: FYLLO_SPAWN_RPC_VERSION,
    kind: "request",
    requestId,
    method: "prompt_to_agent",
    caller: { workspaceId: "workspace-1", parentSessionId: "session-1" },
    params: { agentId: "agent-1", prompt },
  };
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
  mcpAccessGrantRegistry.revokeAll();
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
  for (const dispose of rpcHandlerDisposers.splice(0)) dispose();
  await stopBundledMcpHost();
  await closeBackendServers();
  mcpAccessGrantRegistry.revokeAll();
  vi.useRealTimers();
  vi.clearAllMocks();
  if (originalDisable === undefined) {
    delete process.env.FYLLO_DISABLE_BUNDLED_MCP;
  } else {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = originalDisable;
  }
});

describe("bundled MCP host", () => {
  it("routes concurrent child RPC requests and correlates their responses", async () => {
    rpcHandlerDisposers.push(
      registerBundledMcpRpcHandler("fyllo-spawn", async (request) => ({
        requestId: request.requestId,
      }))
    );
    await startHostAndReadySpawn();
    const child = childFor("fyllo-spawn");

    child.emit("message", rpcRequest("request-a"));
    child.emit("message", rpcRequest("request-b"));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(child.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: "request-a", ok: true }),
        expect.objectContaining({ requestId: "request-b", ok: true }),
      ])
    );
  });

  it("rejects duplicate request IDs while the first request is pending", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    rpcHandlerDisposers.push(
      registerBundledMcpRpcHandler("fyllo-spawn", async () => {
        await pending;
        return { done: true };
      })
    );
    await startHostAndReadySpawn();
    const child = childFor("fyllo-spawn");

    child.emit("message", rpcRequest("duplicate"));
    child.emit("message", rpcRequest("duplicate"));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(child.sent).toContainEqual(
      expect.objectContaining({
        requestId: "duplicate",
        ok: false,
        error: expect.objectContaining({ code: "SPAWN_INVALID_REQUEST" }),
      })
    );
    finish();
  });

  it("aborts a matching RPC request when the child sends cancel", async () => {
    let observedSignal: AbortSignal | undefined;
    rpcHandlerDisposers.push(
      registerBundledMcpRpcHandler(
        "fyllo-spawn",
        (_request, signal) =>
          new Promise<void>((resolve) => {
            observedSignal = signal;
            signal.addEventListener("abort", () => resolve(), { once: true });
          })
      )
    );
    await startHostAndReadySpawn();
    const child = childFor("fyllo-spawn");
    child.emit("message", rpcRequest("cancel-me"));
    child.emit("message", {
      protocol: FYLLO_SPAWN_RPC_PROTOCOL,
      version: FYLLO_SPAWN_RPC_VERSION,
      kind: "cancel",
      requestId: "cancel-me",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(observedSignal?.aborted).toBe(true);
    expect(child.sent).toHaveLength(0);
  });

  it("fences late responses from an exited child generation", async () => {
    let finishOld!: () => void;
    const oldPending = new Promise<void>((resolve) => {
      finishOld = resolve;
    });
    rpcHandlerDisposers.push(
      registerBundledMcpRpcHandler("fyllo-spawn", async (request) => {
        if (request.method !== "prompt_to_agent") throw new Error("Unexpected method");
        if (request.params.prompt === "old") await oldPending;
        return { prompt: request.params.prompt };
      })
    );
    await startHostAndReadySpawn();
    const oldChild = childFor("fyllo-spawn");
    oldChild.emit("message", rpcRequest("same-id", "old"));
    oldChild.emit("exit", 1, null);
    await new Promise<void>((resolve) => setTimeout(resolve, 260));
    await waitForChildCount(4);
    const newChild = childFor("fyllo-spawn", 1);
    newChild.emit("message", rpcRequest("same-id", "new"));
    finishOld();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(oldChild.sent).toHaveLength(0);
    expect(newChild.sent).toContainEqual(
      expect.objectContaining({ requestId: "same-id", ok: true, result: { prompt: "new" } })
    );
  });

  it("ignores malformed RPC envelopes without invoking the handler", async () => {
    const handler = vi.fn();
    rpcHandlerDisposers.push(registerBundledMcpRpcHandler("fyllo-spawn", handler));
    await startHostAndReadySpawn();
    const child = childFor("fyllo-spawn");

    child.emit("message", { ...rpcRequest("bad"), version: 99 });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(handler).not.toHaveBeenCalled();
    expect(child.sent).toHaveLength(0);
  });

  it("keeps one random proxy URL while routing names to independent backend ports", async () => {
    const specsPort = await startBackend("specs");
    const cortexPort = await startBackend("cortex");

    await startHostAndReadySpawn();
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
    expect(specsEndpoint).not.toHaveProperty("token");
    expect(cortexEndpoint).not.toHaveProperty("token");

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
    const token = issueToken(["fyllo-specs", "fyllo-cortex"]);
    expect(loggerMocks.info.mock.calls.flat().join("\n")).not.toContain(token);

    const [specsResponse, cortexResponse] = await Promise.all([
      fetch(specsEndpoint!.url, {
        method: "POST",
        body: "specs-body",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Fyllo-Project-Path": "encoded-project",
          "X-Fyllo-Caller-Context": "spoofed-context",
        },
      }),
      fetch(cortexEndpoint!.url, {
        method: "POST",
        body: "cortex-body",
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    const specsPayload = (await specsResponse.json()) as Record<string, unknown>;
    const cortexPayload = (await cortexResponse.json()) as Record<string, unknown>;
    expect(specsPayload).toMatchObject({
      name: "specs",
      path: "/mcp",
      body: "specs-body",
      projectPath: null,
      callerContext: null,
    });
    expect(specsPayload.authorization).not.toBe(`Bearer ${token}`);
    expect(decodeWorkspaceContext(specsPayload.workspaceContext)).toMatchObject({
      version: 2,
      workspaceId: "workspace-1",
      primaryFolderId: "folder-1",
    });
    expect(cortexPayload).toMatchObject({
      name: "cortex",
      path: "/mcp",
      body: "cortex-body",
      projectPath: null,
      callerContext: null,
    });
    expect(cortexPayload.authorization).toBe(specsPayload.authorization);
  });

  it("returns 404 for unknown routes and 503 for a known unavailable backend", async () => {
    const specsPort = await startBackend("specs");
    await startHostAndReadySpawn();
    childFor("fyllo-specs").emit("message", { type: "ready", port: specsPort });
    childFor("fyllo-cortex").emit("message", { type: "ready", port: 65_000 });
    await waitForBundledMcpInitialReadiness();

    const specsEndpoint = getMcpServerEndpoint("fyllo-specs")!;
    const token = issueToken(["fyllo-specs", "fyllo-cortex"]);
    childFor("fyllo-cortex").emit("exit", 1, null);
    const baseUrl = new URL(specsEndpoint.url);
    const unavailable = await fetch(`${baseUrl.origin}/mcp/fyllo-cortex`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const unknown = await fetch(`${baseUrl.origin}/mcp/unknown`);

    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("1");
    expect(unknown.status).toBe(404);
  });

  it("keeps the proxy URL and token stable when a backend restarts on a new port", async () => {
    const firstPort = await startBackend("first");
    const secondPort = await startBackend("second");
    const cortexPort = await startBackend("cortex");
    await startHostAndReadySpawn();
    const firstChild = childFor("fyllo-specs");
    firstChild.emit("message", { type: "ready", port: firstPort });
    childFor("fyllo-cortex").emit("message", { type: "ready", port: cortexPort });
    await waitForBundledMcpInitialReadiness();

    const before = getMcpServerEndpoint("fyllo-specs")!;
    const token = issueToken(["fyllo-specs"]);
    firstChild.emit("exit", 1, null);
    await new Promise((resolve) => setTimeout(resolve, 260));
    await waitForChildCount(4);
    childFor("fyllo-specs", 1).emit("message", { type: "ready", port: secondPort });
    const after = getMcpServerEndpoint("fyllo-specs")!;

    expect(after).toEqual(before);
    const response = await fetch(after.url, {
      method: "POST",
      body: "after-restart",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      name: "second",
      path: "/mcp",
      body: "after-restart",
      projectPath: null,
      callerContext: null,
    });
    expect(payload.authorization).not.toBe(`Bearer ${token}`);
    expect(decodeWorkspaceContext(payload.workspaceContext)).toMatchObject({
      workspaceId: "workspace-1",
    });
  });

  it("rejects invalid and cross-server capabilities before forwarding", async () => {
    const specsPort = await startBackend("specs");
    const cortexPort = await startBackend("cortex");
    await startHostAndReadySpawn();
    childFor("fyllo-specs").emit("message", { type: "ready", port: specsPort });
    childFor("fyllo-cortex").emit("message", { type: "ready", port: cortexPort });
    await waitForBundledMcpInitialReadiness();

    const specsEndpoint = getMcpServerEndpoint("fyllo-specs")!;
    const cortexEndpoint = getMcpServerEndpoint("fyllo-cortex")!;
    const specsOnlyToken = issueToken(["fyllo-specs"]);

    expect((await fetch(specsEndpoint.url)).status).toBe(401);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "[bundled-mcp-host] proxy authorization rejected server=fyllo-specs reason=missing-token"
    );
    expect(
      (
        await fetch(cortexEndpoint.url, {
          headers: { Authorization: `Bearer ${specsOnlyToken}` },
        })
      ).status
    ).toBe(403);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("server=fyllo-cortex reason=server-forbidden")
    );
  });

  it("shares one readiness timeout and falls back without duplicate spawns", async () => {
    startBundledMcpHost();
    await waitForChildCount(3);
    vi.useFakeTimers();

    const firstWait = waitForBundledMcpInitialReadiness();
    const secondWait = waitForBundledMcpInitialReadiness();
    await vi.advanceTimersByTimeAsync(INITIAL_BACKEND_READY_TIMEOUT_MS);
    await expect(Promise.all([firstWait, secondWait])).resolves.toEqual([undefined, undefined]);

    expect(spawnMocks.calls).toHaveLength(3);
    expect(getMcpServerEndpoint("fyllo-specs")).toBeNull();
    expect(getMcpServerEndpoint("fyllo-cortex")).toBeNull();
  });

  it("stops restarting after the configured maximum attempts", async () => {
    await startHostAndReadySpawn();
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

  it("revokes every active grant when the host stops", async () => {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = "1";
    startBundledMcpHost();
    await waitForBundledMcpInitialReadiness();
    const token = issueToken(["fyllo-specs"]);

    expect(mcpAccessGrantRegistry.authorize(token, "fyllo-specs").status).toBe("authorized");

    await stopBundledMcpHost();

    expect(mcpAccessGrantRegistry.authorize(token, "fyllo-specs")).toEqual({
      status: "unauthorized",
      reason: "grant-not-found",
    });
  });

  it("force-stops every known bundled MCP process group without waiting", async () => {
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
    await startHostAndReadySpawn();
    expect(getBundledMcpProcessIds()).toEqual([20_000, 20_001, 20_002]);

    await forceStopBundledMcpHost();

    expect(killSpy).toHaveBeenCalledWith(-20_000, "SIGKILL");
    expect(killSpy).toHaveBeenCalledWith(-20_001, "SIGKILL");
    expect(killSpy).toHaveBeenCalledWith(-20_002, "SIGKILL");
    expect(getBundledMcpProcessIds()).toEqual([]);
    killSpy.mockRestore();
  });
});

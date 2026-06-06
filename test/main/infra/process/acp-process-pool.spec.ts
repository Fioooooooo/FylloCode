import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { PassThrough } from "stream";

const mocks = vi.hoisted(() => {
  const initialize = vi.fn();

  return {
    initialize,
    child: undefined as unknown,
    capturedClient: undefined as { sessionUpdate: (n: unknown) => unknown } | undefined,
    spawn: vi.fn(),
    readInstalledRecords: vi.fn(),
    getRegistry: vi.fn(),
    registerDisposable: vi.fn(),
  };
});

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
}));

vi.mock("@main/domain/acp/detector", () => ({
  readInstalledRecords: mocks.readInstalledRecords,
}));

vi.mock("@main/infra/storage/acp-registry-cache", () => ({
  getRegistry: mocks.getRegistry,
}));

vi.mock("@main/bootstrap/lifecycle", () => ({
  registerDisposable: mocks.registerDisposable,
}));

vi.mock("@agentclientprotocol/sdk", () => ({
  PROTOCOL_VERSION: 1,
  ndJsonStream: vi.fn(() => ({ transport: true })),
  ClientSideConnection: vi.fn(function (toClient: (agent: unknown) => unknown) {
    // Capture the client object so tests can drive sessionUpdate routing.
    mocks.capturedClient = toClient({}) as { sessionUpdate: (n: unknown) => unknown };
    return {
      initialize: mocks.initialize,
      closeSession: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

interface FakeChild extends EventEmitter {
  pid: number;
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough & { end: ReturnType<typeof vi.fn> };
  killed: boolean;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: ReturnType<typeof vi.fn>;
  triggerClose: () => void;
}

function createFakeChild(pid = 12345): FakeChild {
  const emitter = new EventEmitter() as FakeChild;
  emitter.pid = pid;
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  const stdin = new PassThrough() as PassThrough & { end: ReturnType<typeof vi.fn> };
  const realEnd = stdin.end.bind(stdin);
  stdin.end = vi.fn(((...args: unknown[]) => realEnd(...(args as []))) as never);
  emitter.stdin = stdin;
  emitter.killed = false;
  emitter.exitCode = null;
  emitter.signalCode = null;
  emitter.kill = vi.fn(() => {
    emitter.killed = true;
    return true;
  });
  emitter.triggerClose = () => {
    emitter.exitCode = 0;
    emitter.emit("close", 0, null);
  };
  return emitter;
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

const ORIGINAL_PLATFORM = process.platform;

describe("acp-process-pool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setPlatform(ORIGINAL_PLATFORM);
    const fake = createFakeChild();
    mocks.child = fake;
    mocks.spawn.mockReturnValue(fake);
    mocks.readInstalledRecords.mockResolvedValue({
      "claude-acp": { installPath: "/bin/claude", installMethod: "binary" },
    });
    mocks.getRegistry.mockResolvedValue({
      agents: [
        {
          id: "claude-acp",
          distribution: {},
        },
      ],
    });
    mocks.initialize.mockResolvedValue({
      protocolVersion: 1,
      agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
    });
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it("retains initializeResponse on the returned live process entry", async () => {
    const initResponse = {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { resume: {} },
      },
    };
    mocks.initialize.mockResolvedValue(initResponse);

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    const entry = await getOrStartProcess("claude-acp");

    expect(entry.initializeResponse).toEqual(initResponse);
  });

  it("dedupes concurrent getOrStartProcess calls into a single spawn", async () => {
    let resolveInit!: (value: unknown) => void;
    const initStarted = new Promise<void>((resolveStarted) => {
      mocks.initialize.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInit = resolve;
            resolveStarted();
          })
      );
    });

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    const first = getOrStartProcess("claude-acp");
    const second = getOrStartProcess("claude-acp");

    await initStarted;
    resolveInit({
      protocolVersion: 1,
      agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
    });

    const [a, b] = await Promise.all([first, second]);

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("spawns ACP agent with detached: true on POSIX", async () => {
    setPlatform("darwin");
    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    await getOrStartProcess("claude-acp");

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const opts = mocks.spawn.mock.calls[0][2];
    expect(opts).toMatchObject({ detached: true });
  });

  it("spawns ACP agent with detached: false on Windows", async () => {
    setPlatform("win32");
    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    await getOrStartProcess("claude-acp");

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const opts = mocks.spawn.mock.calls[0][2];
    expect(opts.detached).toBe(false);
  });

  it("uses cross-spawn for Windows npx agents", async () => {
    setPlatform("win32");
    mocks.readInstalledRecords.mockResolvedValue({
      "claude-acp": { installMethod: "npx" },
    });
    mocks.getRegistry.mockResolvedValue({
      agents: [
        {
          id: "claude-acp",
          distribution: {
            npx: {
              package: "@anthropic-ai/claude-code-acp@1.2.3",
              args: ["--stdio"],
            },
          },
        },
      ],
    });

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    await getOrStartProcess("claude-acp");

    expect(mocks.spawn).toHaveBeenCalledWith(
      "npx",
      ["--no-install", "@anthropic-ai/claude-code-acp", "--stdio"],
      expect.objectContaining({ detached: false })
    );
  });

  it("dispose graceful close skips signal escalation", async () => {
    setPlatform("darwin");
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    await getOrStartProcess("claude-acp");

    expect(mocks.registerDisposable).toHaveBeenCalledTimes(1);
    const { dispose } = mocks.registerDisposable.mock.calls[0][0];

    const fake = mocks.child as FakeChild;
    const disposePromise = dispose();
    // Simulate child exiting cleanly during graceful window.
    queueMicrotask(() => fake.triggerClose());
    await disposePromise;

    expect(killSpy).not.toHaveBeenCalledWith(-12345, expect.anything());
    expect(mocks.spawn).toHaveBeenCalledTimes(1); // no taskkill spawn either

    killSpy.mockRestore();
  });

  it("POSIX dispose escalates SIGTERM then SIGKILL when child does not exit", async () => {
    setPlatform("darwin");
    vi.useFakeTimers();
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    await getOrStartProcess("claude-acp");
    const { dispose } = mocks.registerDisposable.mock.calls[0][0];

    const disposePromise = dispose();
    // Drain microtasks so dispose enters the graceful wait.
    await Promise.resolve();
    await Promise.resolve();
    // Skip graceful window (500 ms).
    await vi.advanceTimersByTimeAsync(500);
    // SIGTERM should now have been sent to the process group.
    expect(killSpy).toHaveBeenCalledWith(-12345, "SIGTERM");
    // Skip SIGKILL grace (500 ms).
    await vi.advanceTimersByTimeAsync(500);
    await disposePromise;

    expect(killSpy).toHaveBeenCalledWith(-12345, 0);
    expect(killSpy).toHaveBeenCalledWith(-12345, "SIGKILL");

    killSpy.mockRestore();
    vi.useRealTimers();
  });

  it("POSIX dispose treats ESRCH on SIGTERM as already-exited and skips SIGKILL", async () => {
    setPlatform("darwin");
    vi.useFakeTimers();
    const killSpy = vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
      if (signal === "SIGTERM") {
        const err = new Error("ESRCH") as NodeJS.ErrnoException;
        err.code = "ESRCH";
        throw err;
      }
      return true;
    });

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    await getOrStartProcess("claude-acp");
    const { dispose } = mocks.registerDisposable.mock.calls[0][0];

    const disposePromise = dispose();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);
    await disposePromise;

    const sigtermCalls = killSpy.mock.calls.filter(([, sig]) => sig === "SIGTERM");
    const sigkillCalls = killSpy.mock.calls.filter(([, sig]) => sig === "SIGKILL");
    const probeCalls = killSpy.mock.calls.filter(([, sig]) => sig === 0);
    expect(sigtermCalls).toHaveLength(1);
    expect(probeCalls).toHaveLength(0);
    expect(sigkillCalls).toHaveLength(0);

    killSpy.mockRestore();
    vi.useRealTimers();
  });

  it("Windows dispose invokes taskkill /T /F on the process tree", async () => {
    setPlatform("win32");
    const killSpy = vi.spyOn(process, "kill");

    // Second spawn call corresponds to taskkill; return a fake child that
    // emits close immediately.
    const taskkillProc = new EventEmitter() as EventEmitter & {
      once: typeof EventEmitter.prototype.once;
    };
    mocks.spawn.mockImplementation((cmd: string) => {
      if (cmd === "taskkill") {
        queueMicrotask(() => taskkillProc.emit("close", 0));
        return taskkillProc;
      }
      return mocks.child as FakeChild;
    });

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    await getOrStartProcess("claude-acp");
    const { dispose } = mocks.registerDisposable.mock.calls[0][0];

    vi.useFakeTimers();
    const disposePromise = dispose();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await disposePromise;
    vi.useRealTimers();

    const taskkillCall = mocks.spawn.mock.calls.find(([cmd]) => cmd === "taskkill");
    expect(taskkillCall).toBeDefined();
    expect(taskkillCall![1]).toEqual(["/pid", "12345", "/T", "/F"]);
    expect(taskkillCall![2]).toMatchObject({ stdio: "ignore" });
    expect(killSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });

  describe("sessionUpdate routing", () => {
    it("dispatches to the precise sessionId handler when registered", async () => {
      const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
      const entry = await getOrStartProcess("claude-acp");
      const preciseHandler = vi.fn();
      entry.sessionHandlers.set("sess-1", preciseHandler);

      const notification = { sessionId: "sess-1", update: { sessionUpdate: "x" } };
      await mocks.capturedClient!.sessionUpdate(notification);

      expect(preciseHandler).toHaveBeenCalledWith(notification);
    });

    it("falls back to pendingProbeHandler when no precise handler exists", async () => {
      const { getOrStartProcess, setPendingProbeHandler } =
        await import("@main/infra/process/acp-process-pool");
      await getOrStartProcess("claude-acp");
      const probeHandler = vi.fn();
      setPendingProbeHandler("claude-acp", probeHandler);

      const notification = { sessionId: "sess-1", update: { sessionUpdate: "x" } };
      await mocks.capturedClient!.sessionUpdate(notification);

      expect(probeHandler).toHaveBeenCalledWith(notification);
    });

    it("does not invoke pendingProbeHandler once a precise handler is registered", async () => {
      const { getOrStartProcess, setPendingProbeHandler } =
        await import("@main/infra/process/acp-process-pool");
      const entry = await getOrStartProcess("claude-acp");
      const probeHandler = vi.fn();
      const preciseHandler = vi.fn();
      setPendingProbeHandler("claude-acp", probeHandler);
      entry.sessionHandlers.set("sess-1", preciseHandler);

      const notification = { sessionId: "sess-1", update: { sessionUpdate: "x" } };
      await mocks.capturedClient!.sessionUpdate(notification);

      expect(preciseHandler).toHaveBeenCalledWith(notification);
      expect(probeHandler).not.toHaveBeenCalled();
    });

    it("does not fall back after clearPendingProbeHandler", async () => {
      const { getOrStartProcess, setPendingProbeHandler, clearPendingProbeHandler } =
        await import("@main/infra/process/acp-process-pool");
      await getOrStartProcess("claude-acp");
      const probeHandler = vi.fn();
      setPendingProbeHandler("claude-acp", probeHandler);
      clearPendingProbeHandler("claude-acp");

      await mocks.capturedClient!.sessionUpdate({
        sessionId: "sess-1",
        update: { sessionUpdate: "x" },
      });

      expect(probeHandler).not.toHaveBeenCalled();
    });
  });
});

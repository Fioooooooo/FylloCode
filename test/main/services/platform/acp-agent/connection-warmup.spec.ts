import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAgents: vi.fn(),
  readInstalledRecords: vi.fn(),
  getOrStartProcess: vi.fn(),
  registerDisposable: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@main/infra/acp/agent-catalog", () => ({
  listAgents: mocks.listAgents,
}));
vi.mock("@main/infra/acp/detector", () => ({
  readInstalledRecords: mocks.readInstalledRecords,
}));
vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
}));
vi.mock("@main/bootstrap/lifecycle", () => ({
  registerDisposable: mocks.registerDisposable,
}));
vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("ACP agent connection warmup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.listAgents.mockResolvedValue([]);
    mocks.readInstalledRecords.mockResolvedValue({});
    mocks.getOrStartProcess.mockResolvedValue({});
  });

  it("discovers installed registry agents and every custom agent in catalog order", async () => {
    mocks.listAgents.mockResolvedValue([
      { id: "registry-a", source: "registry" },
      { id: "registry-b", source: "registry" },
      { id: "custom-one", source: "custom" },
      { id: "custom-two", source: "custom" },
    ]);
    mocks.readInstalledRecords.mockResolvedValue({
      "registry-b": { installMethod: "binary" },
    });

    const { resolveInstalledAgentIds } =
      await import("@main/services/platform/acp-agent/connection-warmup");

    await expect(resolveInstalledAgentIds()).resolves.toEqual([
      "registry-b",
      "custom-one",
      "custom-two",
    ]);
  });

  it("dedupes ordered input and shares an in-flight agent across batches", async () => {
    const slow = deferred<unknown>();
    mocks.getOrStartProcess.mockReturnValue(slow.promise);
    const { prewarmAgentConnections } =
      await import("@main/services/platform/acp-agent/connection-warmup");

    const first = prewarmAgentConnections(["agent-a", "agent-a"]);
    const second = prewarmAgentConnections(["agent-a"]);

    expect(mocks.getOrStartProcess).toHaveBeenCalledTimes(1);
    slow.resolve({});

    await expect(first).resolves.toEqual([{ agentId: "agent-a", status: "ready" }]);
    await expect(second).resolves.toEqual([{ agentId: "agent-a", status: "ready" }]);
  });

  it("runs at most two starts and isolates a single agent failure", async () => {
    const starts = new Map(["a", "b", "c"].map((id) => [id, deferred<unknown>()]));
    let active = 0;
    let maxActive = 0;
    mocks.getOrStartProcess.mockImplementation((agentId: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return starts.get(agentId)!.promise.finally(() => {
        active -= 1;
      });
    });
    const { prewarmAgentConnections } =
      await import("@main/services/platform/acp-agent/connection-warmup");

    const batch = prewarmAgentConnections(["a", "b", "c"]);
    expect(mocks.getOrStartProcess).toHaveBeenCalledTimes(2);

    starts.get("a")!.resolve({});
    await vi.waitFor(() => expect(mocks.getOrStartProcess).toHaveBeenCalledTimes(3));
    starts.get("b")!.reject(new Error("broken"));
    starts.get("c")!.resolve({});

    await expect(batch).resolves.toEqual([
      { agentId: "a", status: "ready" },
      { agentId: "b", status: "failed", error: "broken" },
      { agentId: "c", status: "ready" },
    ]);
    expect(maxActive).toBe(2);
    expect(mocks.logger.info).toHaveBeenCalledWith("[acp-agent-warmup] warming a");
    expect(mocks.logger.info).toHaveBeenCalledWith("[acp-agent-warmup] warming b");
    expect(mocks.logger.info).toHaveBeenCalledWith("[acp-agent-warmup] warming c");
    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[acp-agent-warmup] warmed a in \d+ms$/)
    );
    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[acp-agent-warmup] warmed c in \d+ms$/)
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[acp-agent-warmup] failed to warm b in \d+ms$/),
      expect.objectContaining({ message: "broken" })
    );
    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[acp-agent-warmup] batch completed total=3 ready=2 failed=1 in \d+ms$/
      )
    );
  });

  it("joins the process-pool promise when a probe starts a queued agent first", async () => {
    const starts = new Map(["a", "b", "c"].map((id) => [id, deferred<unknown>()]));
    mocks.getOrStartProcess.mockImplementation((agentId: string) => starts.get(agentId)!.promise);
    const { prewarmAgentConnections } =
      await import("@main/services/platform/acp-agent/connection-warmup");

    const batch = prewarmAgentConnections(["a", "b", "c"]);
    const probeStart = mocks.getOrStartProcess("c");
    starts.get("c")!.resolve({});
    await probeStart;

    starts.get("a")!.resolve({});
    await vi.waitFor(() => {
      expect(
        mocks.getOrStartProcess.mock.calls.filter(([agentId]) => agentId === "c")
      ).toHaveLength(2);
    });
    starts.get("b")!.resolve({});

    await expect(batch).resolves.toEqual([
      { agentId: "a", status: "ready" },
      { agentId: "b", status: "ready" },
      { agentId: "c", status: "ready" },
    ]);
  });

  it("runs discovery on the next Immediate and contains discovery failures", async () => {
    vi.useFakeTimers();
    try {
      mocks.listAgents.mockRejectedValue(new Error("catalog unavailable"));
      const { scheduleInstalledAgentConnectionWarmup } =
        await import("@main/services/platform/acp-agent/connection-warmup");

      scheduleInstalledAgentConnectionWarmup();
      expect(mocks.listAgents).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      expect(mocks.listAgents).toHaveBeenCalledOnce();
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "[acp-agent-warmup] failed to discover installed agents",
        expect.objectContaining({ message: "catalog unavailable" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose cancels the initial Immediate and queued work, then rejects new batches", async () => {
    vi.useFakeTimers();
    try {
      const starts = new Map(["a", "b"].map((id) => [id, deferred<unknown>()]));
      mocks.getOrStartProcess.mockImplementation((agentId: string) => starts.get(agentId)!.promise);
      const { prewarmAgentConnections, scheduleInstalledAgentConnectionWarmup } =
        await import("@main/services/platform/acp-agent/connection-warmup");
      const disposable = mocks.registerDisposable.mock.calls[0][0] as { dispose(): void };

      scheduleInstalledAgentConnectionWarmup();
      const batch = prewarmAgentConnections(["a", "b", "c"]);
      disposable.dispose();
      await vi.runAllTimersAsync();

      expect(mocks.listAgents).not.toHaveBeenCalled();
      await expect(prewarmAgentConnections(["d"])).resolves.toEqual([
        {
          agentId: "d",
          status: "failed",
          error: "ACP connection warmup is shutting down",
        },
      ]);
      await expect(prewarmAgentConnections(["a"])).resolves.toEqual([
        {
          agentId: "a",
          status: "failed",
          error: "ACP connection warmup is shutting down",
        },
      ]);

      starts.get("a")!.resolve({});
      starts.get("b")!.resolve({});
      await expect(batch).resolves.toEqual([
        { agentId: "a", status: "ready" },
        { agentId: "b", status: "ready" },
        {
          agentId: "c",
          status: "failed",
          error: "ACP connection warmup was cancelled",
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

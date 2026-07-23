import { describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
  specs: vi.fn().mockResolvedValue(undefined),
  cortex: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/mcp-servers/fyllo-specs/src/server", () => ({
  startServer: serverMocks.specs,
}));

vi.mock("../../src/mcp-servers/fyllo-cortex/src/server", () => ({
  startServer: serverMocks.cortex,
}));

const shutdownEvents = ["SIGTERM", "SIGINT", "disconnect"] as const;

async function expectDisconnectAbort(
  loadEntrypoint: () => Promise<unknown>,
  startServer: typeof serverMocks.specs
): Promise<void> {
  const existingListeners = new Map(
    shutdownEvents.map((event) => [event, new Set(process.listeners(event))])
  );

  try {
    await loadEntrypoint();

    expect(startServer).toHaveBeenCalledOnce();
    const signal = startServer.mock.calls[0]?.[0] as AbortSignal;
    expect(signal.aborted).toBe(false);

    const disconnectListener = process
      .listeners("disconnect")
      .find((listener) => !existingListeners.get("disconnect")?.has(listener));
    expect(disconnectListener).toBeTypeOf("function");

    disconnectListener?.();
    expect(signal.aborted).toBe(true);
  } finally {
    for (const event of shutdownEvents) {
      for (const listener of process.listeners(event)) {
        if (!existingListeners.get(event)?.has(listener)) {
          process.off(event, listener);
        }
      }
    }
  }
}

describe("bundled MCP child process lifecycle", () => {
  it("aborts fyllo-specs when the parent IPC channel disconnects", async () => {
    await expectDisconnectAbort(
      () => import("../../src/mcp-servers/fyllo-specs/src/index"),
      serverMocks.specs
    );
  });

  it("aborts fyllo-cortex when the parent IPC channel disconnects", async () => {
    await expectDisconnectAbort(
      () => import("../../src/mcp-servers/fyllo-cortex/src/index"),
      serverMocks.cortex
    );
  });
});

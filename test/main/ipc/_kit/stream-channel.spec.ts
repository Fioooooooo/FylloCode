import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const port1Listeners = new Map<string, (...args: unknown[]) => void>();
  const port1 = {
    on: vi.fn(),
    start: vi.fn(),
    postMessage: vi.fn(),
    close: vi.fn(),
  };
  const port2 = {
    on: vi.fn(),
    start: vi.fn(),
    postMessage: vi.fn(),
    close: vi.fn(),
  };

  return {
    port1,
    port2,
    port1Listeners,
    MessageChannelMain: vi.fn(function MessageChannelMain() {
      return { port1, port2 };
    }),
  };
});

vi.mock("electron", () => ({
  MessageChannelMain: mocks.MessageChannelMain,
}));

describe("makeStreamChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.port1Listeners.clear();
    mocks.port1.on.mockImplementation((event: string, listener: (...args: unknown[]) => void) => {
      mocks.port1Listeners.set(event, listener);
    });
  });

  const emitPort1 = (event: string): void => {
    const listener = mocks.port1Listeners.get(event);
    if (!listener) throw new Error(`Missing port1 listener for ${event}`);
    listener();
  };

  it("posts a null port payload by default", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const postMessage = vi.fn();

    const result = makeStreamChannel({
      event: { sender: { postMessage } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      onReady: () => ({ start: vi.fn(), cancel: vi.fn() }),
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(postMessage).toHaveBeenCalledWith("session:chat:stream:port", null, [mocks.port2]);
  });

  it("posts a custom port payload when provided", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const postMessage = vi.fn();

    makeStreamChannel({
      event: { sender: { postMessage } } as never,
      portChannel: "session:chat:stream:port",
      portPayload: { streamId: "stream-1" },
      logTag: "test",
      onReady: () => ({ start: vi.fn(), cancel: vi.fn() }),
    });

    expect(postMessage).toHaveBeenCalledWith("session:chat:stream:port", { streamId: "stream-1" }, [
      mocks.port2,
    ]);
  });

  it("does not cancel the runner when a completed stream closes its port", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const runner = { start: vi.fn(), cancel: vi.fn() };
    let sendDone!: (totalTokens: number) => void;

    makeStreamChannel({
      event: { sender: { postMessage: vi.fn() } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      onReady: (sink) => {
        sendDone = sink.sendDone;
        return runner;
      },
    });
    await Promise.resolve();

    sendDone(42);
    emitPort1("close");

    expect(mocks.port1.close).toHaveBeenCalledOnce();
    expect(runner.cancel).not.toHaveBeenCalled();
  });

  it("does not cancel the runner when an errored stream closes its port", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const runner = { start: vi.fn(), cancel: vi.fn() };
    let sendError!: (code: "ACP_ERROR", message: string) => void;

    makeStreamChannel({
      event: { sender: { postMessage: vi.fn() } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      onReady: (sink) => {
        sendError = sink.sendError;
        return runner;
      },
    });
    await Promise.resolve();

    sendError("ACP_ERROR", "failed");
    emitPort1("close");

    expect(mocks.port1.close).toHaveBeenCalledOnce();
    expect(runner.cancel).not.toHaveBeenCalled();
  });

  it("cancels the runner when renderer closes the port before a terminal event", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const runner = { start: vi.fn(), cancel: vi.fn() };

    makeStreamChannel({
      event: { sender: { postMessage: vi.fn() } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      onReady: () => runner,
    });
    await Promise.resolve();

    emitPort1("close");

    expect(runner.cancel).toHaveBeenCalledOnce();
  });

  it("honors an early renderer cancellation after the runner becomes available", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const runner = { start: vi.fn(), cancel: vi.fn() };
    let resolveRunner!: (value: typeof runner) => void;

    makeStreamChannel({
      event: { sender: { postMessage: vi.fn() } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      onReady: () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        }),
    });

    emitPort1("close");
    resolveRunner(runner);
    await Promise.resolve();

    expect(runner.cancel).toHaveBeenCalledOnce();
  });
});

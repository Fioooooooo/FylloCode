import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginShutdown, resetLifecycleForTests } from "@main/bootstrap/lifecycle";
import { IpcErrorCodes } from "@shared/constants/error-codes";

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
    resetLifecycleForTests();
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

  it("keeps the runner alive on port close when cancelOnPortClose is false", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    let startResolve!: () => void;
    const runner = {
      start: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            startResolve = resolve;
          })
      ),
      cancel: vi.fn(),
    };

    makeStreamChannel({
      event: { sender: { postMessage: vi.fn() } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      cancelOnPortClose: false,
      onReady: () => runner,
    });
    await Promise.resolve();

    const messageListener = mocks.port1Listeners.get("message");
    if (!messageListener) throw new Error("Missing port1 listener for message");
    messageListener({ data: { type: "ready" } });
    // launch() 通过 setImmediate 轮询等待 runner 就绪。
    await new Promise((resolve) => setImmediate(resolve));
    expect(runner.start).toHaveBeenCalledOnce();

    emitPort1("close");

    expect(runner.cancel).not.toHaveBeenCalled();
    startResolve();
  });

  it("still cancels on port close before the ready handshake when cancelOnPortClose is false", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const runner = { start: vi.fn(), cancel: vi.fn() };

    makeStreamChannel({
      event: { sender: { postMessage: vi.fn() } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      cancelOnPortClose: false,
      onReady: () => runner,
    });
    await Promise.resolve();

    // ready 握手前 turn 尚未启动，关闭端口必须取消 runner，避免 lease 永久泄漏。
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

  it("does not allocate a stream port after the shutdown fence", async () => {
    const { makeStreamChannel } = await import("@main/ipc/_kit/stream-channel");
    const postMessage = vi.fn();
    const onReady = vi.fn();
    beginShutdown();

    const result = makeStreamChannel({
      event: { sender: { postMessage } } as never,
      portChannel: "session:chat:stream:port",
      logTag: "test",
      onReady,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: IpcErrorCodes.APPLICATION_SHUTTING_DOWN,
        message: "FylloCode 正在退出",
      },
    });
    expect(mocks.MessageChannelMain).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });
});

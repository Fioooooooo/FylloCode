import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
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
  });

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
});

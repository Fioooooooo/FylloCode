import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SessionChatChannels as ChatChannels,
  SessionChatProbeChannels as ChatProbeChannels,
  SessionChatStreamChannels as ChatStreamChannels,
} from "@shared/ipc/session/chat.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

type PortStub = {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};

function createPort(): PortStub {
  return {
    onmessage: null,
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function textParts(text: string): [{ type: "text"; text: string }] {
  return [{ type: "text", text }];
}

function streamPortListener(): (event: { ports: PortStub[] }, payload: unknown) => void {
  const handler = mocks.ipcRenderer.on.mock.calls.find(
    ([channel]) => channel === ChatStreamChannels.streamPort
  )?.[1];
  expect(handler).toBeTypeOf("function");
  return handler as (event: { ports: PortStub[] }, payload: unknown) => void;
}

function streamInvokePayload(index = 0): { streamId: string } {
  const payload = mocks.ipcRenderer.invoke.mock.calls.filter(
    ([channel]) => channel === ChatStreamChannels.streamMessage
  )[index]?.[1] as { streamId?: string } | undefined;
  expect(payload?.streamId).toBeTypeOf("string");
  return payload as { streamId: string };
}

function emitStreamPort(port: PortStub, streamId = streamInvokePayload().streamId): void {
  streamPortListener()({ ports: [port] }, { streamId });
}

describe("preload chatApi.streamMessage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: undefined });
  });

  it("cancels idempotently and closes a received MessagePort", async () => {
    const { chatApi } = await import("@preload/api/session/chat");
    const port = createPort();

    const cancel = chatApi.streamMessage(
      "session-1",
      "project-1",
      "agent-1",
      [{ type: "text", text: "hello" }],
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      }
    );
    emitStreamPort(port);

    expect(port.start).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith({ type: "ready" });

    cancel();
    cancel();

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatStreamChannels.streamCancel, {
      projectId: "project-1",
      sessionId: "session-1",
    });
    expect(
      mocks.ipcRenderer.invoke.mock.calls.filter(
        ([channel]) => channel === ChatStreamChannels.streamCancel
      )
    ).toHaveLength(1);
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("records pending cancel before the port arrives and does not post ready", async () => {
    const { chatApi } = await import("@preload/api/session/chat");
    const port = createPort();

    const cancel = chatApi.streamMessage(
      "session-1",
      "project-1",
      "agent-1",
      [{ type: "text", text: "hello" }],
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      }
    );

    cancel();
    emitStreamPort(port);

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatStreamChannels.streamCancel, {
      projectId: "project-1",
      sessionId: "session-1",
    });
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(port.start).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("binds concurrent MessagePorts by streamId even when ports arrive out of order", async () => {
    const { chatApi } = await import("@preload/api/session/chat");
    const callbacksA = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const callbacksB = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const portA = createPort();
    const portB = createPort();

    chatApi.streamMessage("session-a", "project-1", "agent-1", textParts("A"), callbacksA);
    chatApi.streamMessage("session-b", "project-1", "agent-1", textParts("B"), callbacksB);

    const streamA = streamInvokePayload(0).streamId;
    const streamB = streamInvokePayload(1).streamId;
    expect(streamA).not.toBe(streamB);

    emitStreamPort(portB, streamB);
    portB.onmessage?.({ data: { type: "chunk", data: { kind: "text_delta", text: "B" } } });

    expect(callbacksB.onChunk).toHaveBeenCalledWith({ kind: "text_delta", text: "B" });
    expect(callbacksA.onChunk).not.toHaveBeenCalled();
    expect(portA.start).not.toHaveBeenCalled();

    emitStreamPort(portA, streamA);
    portA.onmessage?.({ data: { type: "done", data: { totalTokens: 2 } } });

    expect(callbacksA.onDone).toHaveBeenCalledWith({ totalTokens: 2 });
  });

  it("closes an unmatched stream port without invoking callbacks", async () => {
    const { chatApi } = await import("@preload/api/session/chat");
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const unmatchedPort = createPort();

    chatApi.streamMessage("session-1", "project-1", "agent-1", textParts("hello"), callbacks);
    emitStreamPort(unmatchedPort, "missing-stream");

    expect(unmatchedPort.close).toHaveBeenCalledTimes(1);
    expect(unmatchedPort.start).not.toHaveBeenCalled();
    expect(callbacks.onChunk).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("invokes readAttachmentDataUrl on the correct channel", async () => {
    const { chatApi } = await import("@preload/api/session/chat");

    await chatApi.readAttachmentDataUrl("file:///tmp/%E6%88%AA%E5%9B%BE%201.png", "image/png");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatChannels.readAttachmentDataUrl, {
      uri: "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
      mediaType: "image/png",
    });
  });

  it("invokes setConfigOption on the correct channel", async () => {
    const { chatApi } = await import("@preload/api/session/chat");

    await chatApi.setConfigOption({
      projectId: "p1",
      sessionId: "s1",
      configId: "model",
      type: "select",
      value: "haiku",
    });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatChannels.setConfigOption, {
      projectId: "p1",
      sessionId: "s1",
      configId: "model",
      type: "select",
      value: "haiku",
    });
  });

  it("passes acpSessionId in streamMessage options", async () => {
    const { chatApi } = await import("@preload/api/session/chat");

    chatApi.streamMessage(
      "session-1",
      "project-1",
      "agent-1",
      [{ type: "text", text: "hello" }],
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
      { acpSessionId: "acp-probe" }
    );

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatStreamChannels.streamMessage, {
      streamId: expect.any(String),
      sessionId: "session-1",
      projectId: "project-1",
      agentId: "agent-1",
      prompt: [{ type: "text", text: "hello" }],
      acpSessionId: "acp-probe",
    });
  });

  it("invokes probe methods on the correct channels", async () => {
    const { chatApi } = await import("@preload/api/session/chat");

    await chatApi.probeEnsure({ agentId: "agent-1", projectId: "project-1" });
    await chatApi.probeClose({ agentId: "agent-1", projectId: "project-1" });
    await chatApi.probeSetConfigOption({
      projectId: "project-1",
      agentId: "agent-1",
      configId: "model",
      type: "select",
      value: "sonnet",
    });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatProbeChannels.ensure, {
      agentId: "agent-1",
      projectId: "project-1",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatProbeChannels.close, {
      projectId: "project-1",
      agentId: "agent-1",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatProbeChannels.setConfigOption, {
      projectId: "project-1",
      agentId: "agent-1",
      configId: "model",
      type: "select",
      value: "sonnet",
    });
  });

  it("subscribes and unsubscribes probe update events", async () => {
    const { chatApi } = await import("@preload/api/session/chat");
    const handler = vi.fn();

    const unsubscribe = chatApi.onProbeUpdate(handler);
    const listener = mocks.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === ChatProbeChannels.update
    )?.[1];
    expect(listener).toBeTypeOf("function");

    const payload = { agentId: "agent-1", snapshot: null };
    listener({}, payload);
    unsubscribe();

    expect(handler).toHaveBeenCalledWith(payload);
    expect(mocks.ipcRenderer.off).toHaveBeenCalledWith(ChatProbeChannels.update, listener);
  });
});

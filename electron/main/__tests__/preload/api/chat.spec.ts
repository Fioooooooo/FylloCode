import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatChannels, ChatProbeChannels, ChatStreamChannels } from "@shared/types/channels";

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

function emitStreamPort(port: PortStub): void {
  const handler = mocks.ipcRenderer.once.mock.calls.find(
    ([channel]) => channel === ChatStreamChannels.streamPort
  )?.[1];
  expect(handler).toBeTypeOf("function");
  handler({ ports: [port] });
}

describe("preload chatApi.streamMessage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: undefined });
  });

  it("cancels idempotently and closes a received MessagePort", async () => {
    const { chatApi } = await import("../../../../preload/api/chat");
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
    const { chatApi } = await import("../../../../preload/api/chat");
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
      sessionId: "session-1",
    });
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(port.start).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("invokes readAttachmentDataUrl on the correct channel", async () => {
    const { chatApi } = await import("../../../../preload/api/chat");

    await chatApi.readAttachmentDataUrl("file:///tmp/%E6%88%AA%E5%9B%BE%201.png", "image/png");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatChannels.readAttachmentDataUrl, {
      uri: "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
      mediaType: "image/png",
    });
  });

  it("invokes setConfigOption on the correct channel", async () => {
    const { chatApi } = await import("../../../../preload/api/chat");

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
    const { chatApi } = await import("../../../../preload/api/chat");

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
      sessionId: "session-1",
      projectId: "project-1",
      agentId: "agent-1",
      prompt: [{ type: "text", text: "hello" }],
      acpSessionId: "acp-probe",
    });
  });

  it("invokes probe methods on the correct channels", async () => {
    const { chatApi } = await import("../../../../preload/api/chat");

    await chatApi.probeEnsure({ agentId: "agent-1", projectId: "project-1" });
    await chatApi.probeClose({ agentId: "agent-1" });
    await chatApi.probeSetConfigOption({
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
      agentId: "agent-1",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ChatProbeChannels.setConfigOption, {
      agentId: "agent-1",
      configId: "model",
      type: "select",
      value: "sonnet",
    });
  });

  it("subscribes and unsubscribes probe update events", async () => {
    const { chatApi } = await import("../../../../preload/api/chat");
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

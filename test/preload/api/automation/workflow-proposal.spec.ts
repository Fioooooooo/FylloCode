import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationWorkflowProposalChannels } from "@shared/ipc/automation/workflow-proposal.channels";
import { AutomationWorkflowProposalDecisionChannels } from "@shared/ipc/automation/workflow-proposal-decision.channels";
import { SessionChatStreamChannels } from "@shared/ipc/session/chat.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
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
};

function createPort(): PortStub {
  return {
    onmessage: null,
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
  };
}

function streamPortListener(): (event: { ports: PortStub[] }, payload: unknown) => void {
  const listener = mocks.ipcRenderer.on.mock.calls.find(
    ([channel]) => channel === SessionChatStreamChannels.streamPort
  )?.[1];
  expect(listener).toBeTypeOf("function");
  return listener as (event: { ports: PortStub[] }, payload: unknown) => void;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("preload workflow proposal dispatch API", () => {
  it("passes the complete confirm dispatch owner and persistence payload", async () => {
    mocks.ipcRenderer.invoke.mockResolvedValue({
      ok: true,
      data: {
        status: "accepted",
        result: { status: "confirmed", workflowId: "workflow-1", persist: "workspace" },
      },
    });
    const { workflowProposalApi } = await import("@preload/api/automation/workflow-proposal");
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onRejected: vi.fn(),
      onAccepted: vi.fn(),
    };
    const port = createPort();

    workflowProposalApi.confirmDispatch(
      {
        workspaceId: "workspace-1",
        parentSessionId: "parent-1",
        proposalId: "proposal-1",
        persist: "workspace",
      },
      callbacks
    );
    const payload = mocks.ipcRenderer.invoke.mock.calls.find(
      ([channel]) => channel === AutomationWorkflowProposalChannels.confirmDispatch
    )?.[1] as Record<string, string>;

    expect(payload).toEqual({
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      proposalId: "proposal-1",
      persist: "workspace",
      streamId: expect.any(String),
    });

    streamPortListener()({ ports: [port] }, { streamId: payload.streamId });
    await flushMicrotasks();

    expect(callbacks.onAccepted).toHaveBeenCalledWith({
      status: "confirmed",
      workflowId: "workflow-1",
      persist: "workspace",
    });
    expect(port.postMessage).toHaveBeenCalledWith({ type: "ready" });
  });

  it("keeps decision dispatch on its independent notification payload", async () => {
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: { status: "busy" } });
    const { workflowProposalApi } = await import("@preload/api/automation/workflow-proposal");
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onRejected: vi.fn(),
      onAccepted: vi.fn(),
    };

    workflowProposalApi.decisionDispatch("workspace-1", "notification-1", "parent-1", callbacks);
    await flushMicrotasks();

    const payload = mocks.ipcRenderer.invoke.mock.calls.find(
      ([channel]) => channel === AutomationWorkflowProposalDecisionChannels.dispatch
    )?.[1];
    expect(payload).toEqual({
      workspaceId: "workspace-1",
      notificationId: "notification-1",
      streamId: expect.any(String),
    });
    expect(callbacks.onRejected).toHaveBeenCalledWith("busy");
  });
});

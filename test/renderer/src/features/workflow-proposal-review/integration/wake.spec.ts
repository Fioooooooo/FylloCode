import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia } from "pinia";

const mocks = vi.hoisted(() => ({
  decisionList: vi.fn(),
  decisionDispatch: vi.fn(),
  onDecisionWake: vi.fn(),
  useChatStore: vi.fn(),
  useWorkspaceStore: vi.fn(),
  useWorkflowProposalStore: vi.fn(),
}));

vi.mock("@renderer/api/automation/workflow-proposal", () => ({
  workflowProposalApi: {
    decisionList: mocks.decisionList,
    decisionDispatch: mocks.decisionDispatch,
    onDecisionWake: mocks.onDecisionWake,
    onWake: vi.fn(),
  },
}));

vi.mock("@renderer/stores/session", () => ({
  useChatStore: mocks.useChatStore,
}));

vi.mock("@renderer/stores", () => ({
  useWorkspaceStore: mocks.useWorkspaceStore,
  useWorkflowProposalStore: mocks.useWorkflowProposalStore,
}));

import {
  drainWorkflowProposalDecisions,
  registerWorkflowProposalDecisionWakeListener,
} from "@renderer/features/workflow-proposal-review/integration/wake";

const workspace = { id: "workspace-1" };

function decision(notificationId: string, parentSessionId: string) {
  return {
    notificationId,
    parentSessionId,
    proposalId: `proposal-${notificationId}`,
    decision: "cancelled" as const,
    state: "pending" as const,
    decidedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

type ChatCallbacks = {
  onAccepted: (result: unknown) => void;
  onRejected: (status: "not_pending" | "busy") => void;
  onChunk: (data: unknown) => void;
  onDone: (data: unknown) => void;
  onError: (error: unknown) => void;
};

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.useWorkspaceStore.mockReturnValue({ currentWorkspace: workspace });
  mocks.useWorkflowProposalStore.mockReturnValue({ handleWake: vi.fn() });
  mocks.onDecisionWake.mockReturnValue(vi.fn());
});

describe("workflow proposal decision wake integration", () => {
  it("routes decision streams through the same Pinia Chat store and serializes one parent", async () => {
    const pinia = createPinia();
    const turns: Array<{
      parentSessionId: string;
      callbacks: ChatCallbacks;
      resolve: (value: { status: "accepted" }) => void;
    }> = [];
    const callbacksByNotification = new Map<string, ChatCallbacks>();
    const receivedChunks: unknown[] = [];
    const dispatches = [
      decision("notification-1", "parent-1"),
      decision("notification-2", "parent-1"),
      decision("notification-3", "parent-2"),
    ];
    mocks.decisionList.mockResolvedValue({ ok: true, data: { decisions: dispatches } });
    mocks.decisionDispatch.mockImplementation(
      (_workspaceId: string, notificationId: string, _parentSessionId: string, callbacks) => {
        callbacksByNotification.set(notificationId, callbacks);
        return vi.fn();
      }
    );
    mocks.useChatStore.mockImplementation((receivedPinia) => ({
      dispatchAppOwnedChatTurn: vi.fn(
        async (
          _workspaceId: string,
          parentSessionId: string,
          dispatch: (callbacks: ChatCallbacks) => () => void,
          options: unknown
        ) => {
          expect(receivedPinia).toBe(pinia);
          expect(options).toEqual({ settleOn: "terminal", acquireLocalTurn: "optional" });
          const callbacks = {
            onAccepted: () => undefined,
            onRejected: () => undefined,
            onChunk: (data: unknown) => receivedChunks.push(data),
            onDone: () => undefined,
            onError: () => undefined,
          };
          dispatch(callbacks);
          return new Promise<{ status: "accepted" }>((resolve) => {
            turns.push({ parentSessionId, callbacks, resolve });
          });
        }
      ),
    }));

    const drain = drainWorkflowProposalDecisions("workspace-1", pinia);
    await vi.waitFor(() => expect(turns).toHaveLength(2));
    expect(turns.map((turn) => turn.parentSessionId)).toEqual(["parent-1", "parent-2"]);
    expect(callbacksByNotification.has("notification-2")).toBe(false);

    const first = callbacksByNotification.get("notification-1");
    expect(first).toBeDefined();
    first!.onAccepted(undefined);
    first!.onChunk({ kind: "text_delta", text: "cancelled" });
    first!.onDone({ totalTokens: 1 });
    turns.find((turn) => turn.parentSessionId === "parent-1")!.resolve({ status: "accepted" });

    const other = callbacksByNotification.get("notification-3");
    expect(other).toBeDefined();
    other!.onAccepted(undefined);
    other!.onDone({ totalTokens: 1 });
    turns.find((turn) => turn.parentSessionId === "parent-2")!.resolve({ status: "accepted" });

    await vi.waitFor(() => expect(callbacksByNotification.has("notification-2")).toBe(true));
    const second = callbacksByNotification.get("notification-2")!;
    second.onAccepted(undefined);
    second.onDone({ totalTokens: 1 });
    turns.find((turn) => turn.callbacks === second)!.resolve({ status: "accepted" });
    await drain;

    expect(mocks.useChatStore).toHaveBeenCalledWith(pinia);
    expect(receivedChunks).toContainEqual({ kind: "text_delta", text: "cancelled" });
  });

  it("retries busy decisions with the same Pinia controller", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    mocks.decisionList
      .mockResolvedValueOnce({
        ok: true,
        data: { decisions: [decision("notification-1", "parent-1")] },
      })
      .mockResolvedValueOnce({ ok: true, data: { decisions: [] } });
    mocks.useChatStore.mockReturnValue({
      dispatchAppOwnedChatTurn: vi.fn().mockResolvedValue({ status: "busy" }),
    });

    await drainWorkflowProposalDecisions("workspace-1", pinia);
    expect(mocks.decisionList).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(mocks.decisionList).toHaveBeenCalledTimes(2));
  });

  it("cleans the decision listener and retry timer for the bound Pinia", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    mocks.decisionList.mockResolvedValue({ ok: true, data: { decisions: [] } });
    const unsubscribe = registerWorkflowProposalDecisionWakeListener(pinia);
    await vi.waitFor(() => expect(mocks.decisionList).toHaveBeenCalledOnce());
    unsubscribe();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.decisionList).toHaveBeenCalledOnce();
  });
});

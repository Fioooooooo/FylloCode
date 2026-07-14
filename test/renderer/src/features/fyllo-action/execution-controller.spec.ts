import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFylloActionExecutionController } from "@renderer/features/fyllo-action/application/execution-controller";
import { createFylloActionExecutionRuntime } from "@renderer/features/fyllo-action/application/execution-runtime";
import type { FylloActionState, FylloActionPayload } from "@shared/fyllo-action/protocol";

function makeReadyState(revision = 1): FylloActionState {
  return {
    type: "task.create",
    status: "ready",
    revision,
    updatedAt: new Date().toISOString(),
  };
}

describe("FylloActionExecutionController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function setup() {
    const runtime = createFylloActionExecutionRuntime();
    const handler = vi.fn();
    const transitionAction = vi.fn();
    const transitionActions = vi.fn();
    const persistActionState = vi.fn();
    const getActionState = vi.fn();

    const controller = createFylloActionExecutionController({
      projectId: "project-1",
      sessionId: "session-1",
      actionId: "action-1",
      type: "task.create",
      handler: handler as never,
      runtime,
      transitionAction,
      transitionActions,
      persistActionState,
      getActionState,
    });

    return {
      controller,
      runtime,
      handler,
      transitionAction,
      transitionActions,
      persistActionState,
      getActionState,
    };
  }

  it("only retries state sync when the business side effect succeeded", async () => {
    const { controller, runtime, handler, transitionAction, persistActionState, getActionState } =
      setup();

    handler.mockResolvedValue({ outcome: "succeeded" });
    getActionState.mockReturnValue(makeReadyState(1));
    transitionAction
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ...makeReadyState(1), status: "succeeded", revision: 2 });

    await controller.execute({ title: "x" } as FylloActionPayload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(runtime.status.value).toBe("succeeded");
    expect(runtime.stateSyncError.value).toBe("network error");
    expect(persistActionState).not.toHaveBeenCalled();

    await controller.retrySync();

    expect(transitionAction).toHaveBeenCalledTimes(2);
    expect(runtime.stateSyncError.value).toBeNull();
    expect(persistActionState).toHaveBeenCalledWith(
      "action-1",
      expect.objectContaining({ status: "succeeded", revision: 2 })
    );
  });

  it("batch succeeds all pending actions at once", async () => {
    const { controller, runtime, handler, transitionActions, persistActionState, getActionState } =
      setup();

    handler.mockResolvedValue({
      outcome: "succeeded",
      completedActionIds: ["action-2", "action-3"],
    });
    getActionState.mockReturnValue(makeReadyState(1));
    transitionActions.mockResolvedValue([
      {
        actionId: "action-1",
        success: true,
        record: { ...makeReadyState(1), status: "succeeded", revision: 2 },
      },
      {
        actionId: "action-2",
        success: true,
        record: { ...makeReadyState(1), status: "succeeded", revision: 2 },
      },
      {
        actionId: "action-3",
        success: true,
        record: { ...makeReadyState(1), status: "succeeded", revision: 2 },
      },
    ]);

    await controller.execute({ title: "x" } as FylloActionPayload);

    expect(runtime.status.value).toBe("succeeded");
    expect(transitionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        actionIds: ["action-1", "action-2", "action-3"],
        expectedRevisions: {
          "action-1": 1,
          "action-2": 1,
          "action-3": 1,
        },
      })
    );
    expect(persistActionState).toHaveBeenCalledTimes(3);
  });

  it("does not persist any local state when a batch transition partially fails", async () => {
    const { runtime, transitionActions, persistActionState, getActionState } = setup();

    const handler = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      completedActionIds: ["action-2"],
    });
    getActionState.mockReturnValue(makeReadyState(1));
    transitionActions.mockResolvedValue([
      {
        actionId: "action-1",
        success: true,
        record: { ...makeReadyState(1), status: "succeeded", revision: 2 },
      },
      { actionId: "action-2", success: false, error: "REVISION_MISMATCH" },
    ]);

    const controllerWithHandler = createFylloActionExecutionController({
      projectId: "project-1",
      sessionId: "session-1",
      actionId: "action-1",
      type: "task.create",
      handler: handler as never,
      runtime,
      transitionAction: vi.fn(),
      transitionActions,
      persistActionState,
      getActionState,
    });

    await controllerWithHandler.execute({ title: "x" } as FylloActionPayload);

    expect(runtime.status.value).toBe("succeeded");
    expect(runtime.stateSyncError.value).toContain("REVISION_MISMATCH");
    expect(persistActionState).not.toHaveBeenCalled();
  });

  it("uses the current persisted revision for CAS instead of hardcoding 1", async () => {
    const { controller, handler, transitionAction, getActionState } = setup();

    handler.mockResolvedValue({ outcome: "succeeded" });
    getActionState.mockReturnValue(makeReadyState(3));
    transitionAction.mockResolvedValue({ ...makeReadyState(3), status: "succeeded", revision: 4 });

    await controller.execute({ title: "x" } as FylloActionPayload);

    expect(transitionAction).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 3 }));
  });
});

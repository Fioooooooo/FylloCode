import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationWorkflowRunChannels } from "@shared/ipc/automation/workflow-run.channels";
import {
  setupWorkflowRunBroadcast,
  WorkflowRunWakeDispatcher,
} from "@main/ipc/automation/workflow-run";

describe("Workflow Run wake dispatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces wakes by Workspace and Run and sends only the invalidation payload", () => {
    const sendToWorkspace = vi.fn();
    const dispatcher = new WorkflowRunWakeDispatcher({ sendToWorkspace });
    const payload = { workspaceId: "workspace-1", runId: "run-1" };

    dispatcher.notify(payload);
    dispatcher.notify({ ...payload });
    vi.advanceTimersByTime(39);
    expect(sendToWorkspace).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sendToWorkspace).toHaveBeenCalledOnce();
    expect(sendToWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      AutomationWorkflowRunChannels.wake,
      payload
    );
    expect(sendToWorkspace.mock.calls[0]?.[2]).toEqual({
      workspaceId: "workspace-1",
      runId: "run-1",
    });
    dispatcher.dispose();
  });

  it("cancels pending wakes after disposal", () => {
    const sendToWorkspace = vi.fn();
    const dispatcher = new WorkflowRunWakeDispatcher({ sendToWorkspace });
    dispatcher.notify({ workspaceId: "workspace-1", runId: "run-1" });
    dispatcher.dispose();
    vi.runAllTimers();
    dispatcher.notify({ workspaceId: "workspace-1", runId: "run-1" });

    expect(sendToWorkspace).not.toHaveBeenCalled();
  });

  it("binds the dispatcher to the engine wake handler and releases it on cleanup", () => {
    const sendToWorkspace = vi.fn();
    const setWakeHandler = vi.fn();
    const cleanup = setupWorkflowRunBroadcast(
      { sendToWorkspace },
      { setWakeHandler },
      { delayMs: 10 }
    );
    const handler = setWakeHandler.mock.calls[0]?.[0] as
      ((payload: { workspaceId: string; runId: string }) => void) | undefined;
    handler?.({ workspaceId: "workspace-1", runId: "run-1" });
    vi.advanceTimersByTime(10);
    expect(sendToWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      AutomationWorkflowRunChannels.wake,
      { workspaceId: "workspace-1", runId: "run-1" }
    );

    cleanup();
    expect(setWakeHandler).toHaveBeenLastCalledWith(null);
  });
});

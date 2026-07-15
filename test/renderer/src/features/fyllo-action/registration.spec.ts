import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFylloActionRegistrationController } from "@renderer/features/fyllo-action/application/registration";
import type { FylloActionReadyParseResult, FylloActionState } from "@shared/fyllo-action/protocol";

function makeReadyParseResult(
  type: FylloActionReadyParseResult["type"] = "task.create"
): FylloActionReadyParseResult {
  return {
    status: "ready",
    type,
    payload: type === "task.create" ? { title: "x" } : { slug: "x", goal: "y" },
  } as FylloActionReadyParseResult;
}

function makeReadyState(overrides: Partial<FylloActionState> = {}): FylloActionState {
  return {
    type: "task.create",
    status: "ready",
    revision: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FylloActionRegistrationController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function setup() {
    const registerAction = vi.fn();
    const persistActionState = vi.fn();
    const controller = createFylloActionRegistrationController(registerAction, persistActionState);

    return { controller, registerAction, persistActionState };
  }

  it("calls registerAction once for a ready parse result and persists the returned state", async () => {
    const { controller, registerAction, persistActionState } = setup();
    const state = makeReadyState();
    registerAction.mockResolvedValue(state);

    await controller.register("project-1", "session-1", "action-1", makeReadyParseResult());

    expect(registerAction).toHaveBeenCalledTimes(1);
    expect(registerAction).toHaveBeenCalledWith({
      projectId: "project-1",
      sessionId: "session-1",
      actionId: "action-1",
      type: "task.create",
    });
    expect(persistActionState).toHaveBeenCalledWith("session-1", "action-1", state);
    expect(controller.registrationErrors.value.has("action-1")).toBe(false);
  });

  it("does not call registerAction again while the same actionId is in flight", async () => {
    const { controller, registerAction, persistActionState } = setup();
    const deferred = Promise.withResolvers<FylloActionState>();
    registerAction.mockReturnValue(deferred.promise);

    const first = controller.register("project-1", "session-1", "action-1", makeReadyParseResult());
    const second = controller.register(
      "project-1",
      "session-1",
      "action-1",
      makeReadyParseResult()
    );

    expect(registerAction).toHaveBeenCalledTimes(1);
    expect(controller.isInFlight("action-1")).toBe(true);

    deferred.resolve(makeReadyState());
    await Promise.all([first, second]);

    expect(registerAction).toHaveBeenCalledTimes(1);
    expect(persistActionState).toHaveBeenCalledTimes(1);
  });

  it("does not register again after the ready state was persisted locally", async () => {
    const { controller, registerAction, persistActionState } = setup();
    registerAction.mockResolvedValue(makeReadyState());

    await controller.register("project-1", "session-1", "action-1", makeReadyParseResult());
    await controller.register("project-1", "session-1", "action-1", makeReadyParseResult());

    expect(registerAction).toHaveBeenCalledTimes(1);
    expect(persistActionState).toHaveBeenCalledTimes(1);
  });

  it("records a registration error on failure and allows retry", async () => {
    const { controller, registerAction, persistActionState } = setup();
    registerAction
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(makeReadyState());

    await controller.register("project-1", "session-1", "action-1", makeReadyParseResult());

    expect(controller.registrationErrors.value.get("action-1")).toBe("network error");
    expect(persistActionState).not.toHaveBeenCalled();

    await controller.register("project-1", "session-1", "action-1", makeReadyParseResult());
    expect(registerAction).toHaveBeenCalledTimes(1);

    await controller.retry("project-1", "session-1", "action-1", "task.create");

    expect(registerAction).toHaveBeenCalledTimes(2);
    expect(persistActionState).toHaveBeenCalledTimes(1);
    expect(controller.registrationErrors.value.has("action-1")).toBe(false);
  });

  it("skips registration for non-ready parse results", async () => {
    const { controller, registerAction, persistActionState } = setup();

    await controller.register("project-1", "session-1", "action-1", {
      status: "pending",
      type: "task.create",
    });

    expect(registerAction).not.toHaveBeenCalled();
    expect(persistActionState).not.toHaveBeenCalled();
  });

  it("passes the parsed action type to registerAction for all confirm types", async () => {
    const { controller, registerAction } = setup();
    registerAction.mockResolvedValue(makeReadyState({ type: "knowledge.flag" }));

    await controller.register(
      "project-1",
      "session-1",
      "action-1",
      makeReadyParseResult("knowledge.flag")
    );

    expect(registerAction).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "action-1",
        type: "knowledge.flag",
      })
    );
  });
});

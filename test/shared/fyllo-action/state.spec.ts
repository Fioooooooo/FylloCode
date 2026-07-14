import { describe, expect, it } from "vitest";
import {
  applyFylloActionTransition,
  commandToStatus,
  createInitialFylloActionState,
  FylloActionStateMachineError,
  isFylloActionResolved,
  isFylloActionTerminal,
  isValidFylloActionTransition,
  requiresFylloActionAttention,
} from "@shared/fyllo-action/state";
import type { FylloActionState } from "@shared/fyllo-action/protocol";

function state(status: FylloActionState["status"], revision = 1, error?: string): FylloActionState {
  return {
    type: "task.create",
    status,
    revision,
    updatedAt: "2026-06-08T00:00:00.000Z",
    error,
  };
}

describe("fyllo-action state predicates", () => {
  it("ready requires attention and is not resolved", () => {
    expect(requiresFylloActionAttention(state("ready"))).toBe(true);
    expect(isFylloActionResolved(state("ready"))).toBe(false);
    expect(isFylloActionTerminal("ready")).toBe(false);
  });

  it("failed requires attention and is not resolved", () => {
    expect(requiresFylloActionAttention(state("failed"))).toBe(true);
    expect(isFylloActionResolved(state("failed"))).toBe(false);
    expect(isFylloActionTerminal("failed")).toBe(false);
  });

  it("succeeded is resolved and does not require attention", () => {
    expect(requiresFylloActionAttention(state("succeeded"))).toBe(false);
    expect(isFylloActionResolved(state("succeeded"))).toBe(true);
    expect(isFylloActionTerminal("succeeded")).toBe(true);
  });

  it("cancelled is resolved and does not require attention", () => {
    expect(requiresFylloActionAttention(state("cancelled"))).toBe(false);
    expect(isFylloActionResolved(state("cancelled"))).toBe(true);
    expect(isFylloActionTerminal("cancelled")).toBe(true);
  });
});

describe("fyllo-action state machine", () => {
  it("allows none -> ready", () => {
    expect(isValidFylloActionTransition(undefined, "ready")).toBe(true);
  });

  it("allows ready -> succeeded/failed/cancelled", () => {
    expect(isValidFylloActionTransition("ready", "succeeded")).toBe(true);
    expect(isValidFylloActionTransition("ready", "failed")).toBe(true);
    expect(isValidFylloActionTransition("ready", "cancelled")).toBe(true);
  });

  it("allows failed -> succeeded/failed/cancelled", () => {
    expect(isValidFylloActionTransition("failed", "succeeded")).toBe(true);
    expect(isValidFylloActionTransition("failed", "failed")).toBe(true);
    expect(isValidFylloActionTransition("failed", "cancelled")).toBe(true);
  });

  it("rejects transitions from terminal states", () => {
    expect(isValidFylloActionTransition("succeeded", "ready")).toBe(false);
    expect(isValidFylloActionTransition("succeeded", "succeeded")).toBe(false);
    expect(isValidFylloActionTransition("cancelled", "failed")).toBe(false);
  });

  it("commandToStatus maps commands correctly", () => {
    expect(commandToStatus("succeed")).toBe("succeeded");
    expect(commandToStatus("fail")).toBe("failed");
    expect(commandToStatus("cancel")).toBe("cancelled");
  });

  it("createInitialFylloActionState creates ready with revision 1", () => {
    const initial = createInitialFylloActionState("task.create", {
      updatedAt: "2026-06-08T00:00:00.000Z",
    });
    expect(initial).toEqual({
      type: "task.create",
      status: "ready",
      revision: 1,
      updatedAt: "2026-06-08T00:00:00.000Z",
    });
  });

  it("applyFylloActionTransition updates status and revision", () => {
    const next = applyFylloActionTransition(state("ready", 1), "succeed", {
      updatedAt: "2026-06-08T00:00:01.000Z",
      nextRevision: 2,
    });
    expect(next).toEqual({
      type: "task.create",
      status: "succeeded",
      revision: 2,
      updatedAt: "2026-06-08T00:00:01.000Z",
    });
  });

  it("applyFylloActionTransition persists error on fail", () => {
    const next = applyFylloActionTransition(state("ready", 1), "fail", {
      updatedAt: "2026-06-08T00:00:01.000Z",
      nextRevision: 2,
      error: "Network timeout",
    });
    expect(next.error).toBe("Network timeout");
    expect(next.status).toBe("failed");
  });

  it("applyFylloActionTransition clears error on succeed", () => {
    const next = applyFylloActionTransition(state("failed", 1, "boom"), "succeed", {
      updatedAt: "2026-06-08T00:00:01.000Z",
      nextRevision: 2,
    });
    expect(next.error).toBeUndefined();
    expect(next.status).toBe("succeeded");
  });

  it("applyFylloActionTransition rejects invalid transitions", () => {
    expect(() =>
      applyFylloActionTransition(state("succeeded"), "cancel", {
        updatedAt: "2026-06-08T00:00:01.000Z",
        nextRevision: 2,
      })
    ).toThrow(FylloActionStateMachineError);
  });

  it("applyFylloActionTransition rejects transitioning unregistered action", () => {
    expect(() =>
      applyFylloActionTransition(undefined, "succeed", {
        updatedAt: "2026-06-08T00:00:01.000Z",
        nextRevision: 1,
      })
    ).toThrow(FylloActionStateMachineError);
  });
});

import { describe, expect, it } from "vitest";
import {
  ensureTaskSubjectInputSchema,
  getBrowserInputSchema,
  getByTaskInputSchema,
  linkTaskSessionInputSchema,
} from "@shared/ipc/insight/lineage.schemas";

describe("lineage ipc schemas", () => {
  const snapshot = {
    ref: "local:task-1",
    snapshot: {
      id: "task-1",
      title: "Task 1",
    },
    capturedAt: "2026-06-09T00:00:00.000Z",
  };

  it("accepts valid ensureTaskSubject input", () => {
    expect(ensureTaskSubjectInputSchema.parse({ workspaceId: "workspace-1", snapshot })).toEqual({
      workspaceId: "workspace-1",
      snapshot,
    });
  });

  it("rejects ensureTaskSubject input missing snapshot ref", () => {
    const { ref, ...snapshotWithoutRef } = snapshot;
    void ref;

    const result = ensureTaskSubjectInputSchema.safeParse({
      workspaceId: "workspace-1",
      snapshot: snapshotWithoutRef,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid task refs", () => {
    expect(
      linkTaskSessionInputSchema.safeParse({
        workspaceId: "workspace-1",
        taskRef: "slack:task-1",
        sessionId: "session-1",
      }).success
    ).toBe(false);

    expect(
      getByTaskInputSchema.safeParse({
        workspaceId: "workspace-1",
        ref: "local:",
      }).success
    ).toBe(false);
  });

  it("rejects empty project ids", () => {
    const result = getByTaskInputSchema.safeParse({
      workspaceId: "",
      ref: "github:42",
    });

    expect(result.success).toBe(false);
  });

  it("accepts browser input and strips unrelated fields", () => {
    expect(
      getBrowserInputSchema.parse({ workspaceId: "workspace-1", unrelated: "ignored" })
    ).toEqual({
      workspaceId: "workspace-1",
    });
  });

  it("rejects invalid browser project ids", () => {
    expect(getBrowserInputSchema.safeParse({ workspaceId: "" }).success).toBe(false);
    expect(getBrowserInputSchema.safeParse({ workspaceId: 42 }).success).toBe(false);
    expect(getBrowserInputSchema.safeParse({}).success).toBe(false);
  });
});

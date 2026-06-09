import { describe, expect, it } from "vitest";
import {
  ensureTaskSubjectInputSchema,
  getByTaskInputSchema,
  linkTaskSessionInputSchema,
} from "@shared/schemas/ipc/lineage";

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
    expect(ensureTaskSubjectInputSchema.parse({ projectId: "project-1", snapshot })).toEqual({
      projectId: "project-1",
      snapshot,
    });
  });

  it("rejects ensureTaskSubject input missing snapshot ref", () => {
    const { ref, ...snapshotWithoutRef } = snapshot;
    void ref;

    const result = ensureTaskSubjectInputSchema.safeParse({
      projectId: "project-1",
      snapshot: snapshotWithoutRef,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid task refs", () => {
    expect(
      linkTaskSessionInputSchema.safeParse({
        projectId: "project-1",
        taskRef: "slack:task-1",
        sessionId: "session-1",
      }).success
    ).toBe(false);

    expect(
      getByTaskInputSchema.safeParse({
        projectId: "project-1",
        ref: "local:",
      }).success
    ).toBe(false);
  });

  it("rejects empty project ids", () => {
    const result = getByTaskInputSchema.safeParse({
      projectId: "",
      ref: "github:42",
    });

    expect(result.success).toBe(false);
  });
});

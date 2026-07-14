import { describe, expect, it } from "vitest";
import {
  fylloActionStateSchema,
  knowledgeFlagFylloActionPayloadSchema,
  persistedFylloActionStatesSchema,
  registerFylloActionInputSchema,
  safeSessionIdSchema,
  transitionFylloActionInputSchema,
  transitionFylloActionsInputSchema,
} from "@shared/fyllo-action/schemas";

describe("fyllo-action schemas", () => {
  it("accepts a valid ready state", () => {
    expect(
      fylloActionStateSchema.safeParse({
        type: "task.create",
        status: "ready",
        revision: 1,
        updatedAt: "2026-06-08T00:00:00.000Z",
      }).success
    ).toBe(true);
  });

  it("rejects a state without revision", () => {
    expect(
      fylloActionStateSchema.safeParse({
        type: "task.create",
        status: "ready",
        updatedAt: "2026-06-08T00:00:00.000Z",
      }).success
    ).toBe(false);
  });

  it("rejects error longer than 1000 chars", () => {
    expect(
      fylloActionStateSchema.safeParse({
        type: "task.create",
        status: "failed",
        revision: 1,
        updatedAt: "2026-06-08T00:00:00.000Z",
        error: "x".repeat(1001),
      }).success
    ).toBe(false);
  });

  it("accepts valid session id", () => {
    expect(safeSessionIdSchema.safeParse("session-abc123").success).toBe(true);
  });

  it("rejects session id with path separators", () => {
    expect(safeSessionIdSchema.safeParse("session/../other").success).toBe(false);
    expect(safeSessionIdSchema.safeParse("session/other").success).toBe(false);
    expect(safeSessionIdSchema.safeParse("").success).toBe(false);
  });

  it("accepts valid register input", () => {
    expect(
      registerFylloActionInputSchema.safeParse({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:0:0:0",
        type: "task.create",
      }).success
    ).toBe(true);
  });

  it("accepts valid transition input with error", () => {
    expect(
      transitionFylloActionInputSchema.safeParse({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:0:0:0",
        command: "fail",
        expectedRevision: 1,
        error: "Something went wrong",
      }).success
    ).toBe(true);
  });

  it("accepts valid batch transition input", () => {
    expect(
      transitionFylloActionsInputSchema.safeParse({
        projectId: "project-1",
        sessionId: "session-1",
        actionIds: ["chat:session-1:0:0:0", "chat:session-1:0:0:1"],
        command: "succeed",
        expectedRevisions: {
          "chat:session-1:0:0:0": 1,
          "chat:session-1:0:0:1": 2,
        },
      }).success
    ).toBe(true);
  });

  it("rejects batch transition with empty actionIds", () => {
    expect(
      transitionFylloActionsInputSchema.safeParse({
        projectId: "project-1",
        sessionId: "session-1",
        actionIds: [],
        command: "succeed",
        expectedRevisions: {},
      }).success
    ).toBe(false);
  });

  it("accepts versioned action states envelope", () => {
    expect(
      persistedFylloActionStatesSchema.safeParse({
        version: 1,
        records: {
          "chat:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-06-08T00:00:00.000Z",
          },
        },
      }).success
    ).toBe(true);
  });

  it("rejects knowledge flag summary with line breaks", () => {
    expect(
      knowledgeFlagFylloActionPayloadSchema.safeParse({
        summary: "Line one\nLine two",
      }).success
    ).toBe(false);
    expect(
      knowledgeFlagFylloActionPayloadSchema.safeParse({
        summary: "Line one\rLine two",
      }).success
    ).toBe(false);
  });
});

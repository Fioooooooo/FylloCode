import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";

const mocks = vi.hoisted(() => ({
  resolveProjectPath: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  resolveProjectPath: mocks.resolveProjectPath,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: mocks.loadSessionMeta,
  patchSessionMeta: mocks.patchSessionMeta,
}));

import {
  FylloActionServiceError,
  registerAction,
  transitionAction,
  transitionActions,
} from "@main/services/session/action/action-service";

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "session-1",
    agentId: "claude-acp",
    title: "Session",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("action-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
  });

  describe("registerAction", () => {
    it("creates a new action state when absent", async () => {
      const currentMeta = meta();
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);
      mocks.patchSessionMeta.mockImplementation(async (_projectPath, _sessionId, patch) => {
        const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
        return { ...currentMeta, ...nextPatch };
      });

      const state = await registerAction({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "task:session-1:0:0:0",
        type: "task.create",
      });

      expect(state).toMatchObject({
        type: "task.create",
        status: "ready",
        revision: 1,
      });
      expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
        "/tmp/project",
        "session-1",
        expect.objectContaining({
          actionStates: {
            "task:session-1:0:0:0": expect.objectContaining({
              type: "task.create",
              status: "ready",
              revision: 1,
            }),
          },
        })
      );
    });

    it("returns existing action state without overwriting (remount idempotency)", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);

      const state = await registerAction({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "task:session-1:0:0:0",
        type: "task.create",
      });

      expect(state).toEqual({
        type: "task.create",
        status: "ready",
        revision: 1,
        updatedAt: "2026-05-14T00:00:00.000Z",
      });
      expect(mocks.patchSessionMeta).not.toHaveBeenCalled();
    });

    it("rejects when existing action type mismatches", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);

      await expect(
        registerAction({
          projectId: "project-1",
          sessionId: "session-1",
          actionId: "task:session-1:0:0:0",
          type: "plan.create",
        })
      ).rejects.toBeInstanceOf(FylloActionServiceError);
    });

    it("rejects unsupported action types", async () => {
      mocks.loadSessionMeta.mockResolvedValue(meta());

      await expect(
        registerAction({
          projectId: "project-1",
          sessionId: "session-1",
          actionId: "unknown:session-1:0:0:0",
          // Cast to satisfy the input type while exercising runtime validation.
          type: "unknown.type" as "task.create",
        })
      ).rejects.toBeInstanceOf(FylloActionServiceError);
    });

    it("throws when session is not found", async () => {
      mocks.loadSessionMeta.mockResolvedValue(null);

      await expect(
        registerAction({
          projectId: "project-1",
          sessionId: "session-1",
          actionId: "task:session-1:0:0:0",
          type: "task.create",
        })
      ).rejects.toMatchObject({ code: "CHAT_SESSION_NOT_FOUND" });
    });
  });

  describe("transitionAction", () => {
    it("transitions ready to succeeded with correct revision", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);
      mocks.patchSessionMeta.mockImplementation(async (_projectPath, _sessionId, patch) => {
        const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
        return { ...currentMeta, ...nextPatch };
      });

      const state = await transitionAction({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "task:session-1:0:0:0",
        command: "succeed",
        expectedRevision: 1,
      });

      expect(state).toMatchObject({
        type: "task.create",
        status: "succeeded",
        revision: 2,
      });
    });

    it("rejects revision mismatch", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 2,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);

      await expect(
        transitionAction({
          projectId: "project-1",
          sessionId: "session-1",
          actionId: "task:session-1:0:0:0",
          command: "succeed",
          expectedRevision: 1,
        })
      ).rejects.toMatchObject({ code: "REVISION_MISMATCH" });
    });

    it("does not overwrite terminal states", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "succeeded",
            revision: 2,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);

      await expect(
        transitionAction({
          projectId: "project-1",
          sessionId: "session-1",
          actionId: "task:session-1:0:0:0",
          command: "succeed",
          expectedRevision: 2,
        })
      ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    });

    it("persists error on fail transition", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);
      mocks.patchSessionMeta.mockImplementation(async (_projectPath, _sessionId, patch) => {
        const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
        return { ...currentMeta, ...nextPatch };
      });

      const state = await transitionAction({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "task:session-1:0:0:0",
        command: "fail",
        expectedRevision: 1,
        error: "user declined",
      });

      expect(state).toMatchObject({
        status: "failed",
        revision: 2,
        error: "user declined",
      });
    });

    it("throws when action is not found", async () => {
      mocks.loadSessionMeta.mockResolvedValue(meta());

      await expect(
        transitionAction({
          projectId: "project-1",
          sessionId: "session-1",
          actionId: "task:session-1:0:0:0",
          command: "succeed",
          expectedRevision: 1,
        })
      ).rejects.toMatchObject({ code: "ACTION_NOT_FOUND" });
    });
  });

  describe("transitionActions", () => {
    it("persists only when all actions transition successfully", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
          "plan:session-1:0:0:1": {
            type: "plan.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);
      mocks.patchSessionMeta.mockImplementation(async (_projectPath, _sessionId, patch) => {
        const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
        return { ...currentMeta, ...nextPatch };
      });

      const results = await transitionActions({
        projectId: "project-1",
        sessionId: "session-1",
        actionIds: ["task:session-1:0:0:0", "plan:session-1:0:0:1"],
        command: "succeed",
        expectedRevisions: {
          "task:session-1:0:0:0": 1,
          "plan:session-1:0:0:1": 1,
        },
      });

      expect(results.every((r) => r.success)).toBe(true);
      expect(mocks.patchSessionMeta).toHaveBeenCalledTimes(1);
    });

    it("does not persist when any action fails revision check", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
          "plan:session-1:0:0:1": {
            type: "plan.create",
            status: "ready",
            revision: 2,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);
      mocks.patchSessionMeta.mockImplementation(async (_projectPath, _sessionId, patch) => {
        const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
        return { ...currentMeta, ...nextPatch };
      });

      const results = await transitionActions({
        projectId: "project-1",
        sessionId: "session-1",
        actionIds: ["task:session-1:0:0:0", "plan:session-1:0:0:1"],
        command: "succeed",
        expectedRevisions: {
          "task:session-1:0:0:0": 1,
          "plan:session-1:0:0:1": 1,
        },
      });

      expect(results).toEqual([
        expect.objectContaining({ actionId: "task:session-1:0:0:0", success: true }),
        expect.objectContaining({
          actionId: "plan:session-1:0:0:1",
          success: false,
          error: "REVISION_MISMATCH",
        }),
      ]);
      expect(mocks.patchSessionMeta).not.toHaveBeenCalled();
    });

    it("does not persist when any action is missing", async () => {
      const currentMeta = meta({
        actionStates: {
          "task:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: "2026-05-14T00:00:00.000Z",
          },
        },
      });
      mocks.loadSessionMeta.mockResolvedValue(currentMeta);

      const results = await transitionActions({
        projectId: "project-1",
        sessionId: "session-1",
        actionIds: ["task:session-1:0:0:0", "missing:session-1:0:0:1"],
        command: "succeed",
        expectedRevisions: {
          "task:session-1:0:0:0": 1,
          "missing:session-1:0:0:1": 1,
        },
      });

      expect(results).toEqual([
        expect.objectContaining({ actionId: "task:session-1:0:0:0", success: true }),
        expect.objectContaining({
          actionId: "missing:session-1:0:0:1",
          success: false,
          error: "ACTION_NOT_FOUND",
        }),
      ]);
      expect(mocks.patchSessionMeta).not.toHaveBeenCalled();
    });
  });
});

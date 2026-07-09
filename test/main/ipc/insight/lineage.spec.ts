import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { InsightLineageChannels as LineageChannels } from "@shared/ipc/insight/lineage.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  resolveProjectPath: vi.fn(),
  ensureTaskSubject: vi.fn(),
  linkTaskSession: vi.fn(),
  getByTask: vi.fn(),
  getBySession: vi.fn(),
  createSessionTask: vi.fn(),
  readPlan: vi.fn(),
  savePlanBody: vi.fn(),
  approvePlan: vi.fn(),
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  resolveProjectPath: mocks.resolveProjectPath,
}));

vi.mock("@main/services/insight/lineage/lineage-service", () => ({
  ensureTaskSubject: mocks.ensureTaskSubject,
  linkTaskSession: mocks.linkTaskSession,
  getByTask: mocks.getByTask,
  getBySession: mocks.getBySession,
  createSessionTask: mocks.createSessionTask,
}));

vi.mock("@main/services/insight/lineage/plan", () => ({
  readPlan: mocks.readPlan,
  savePlanBody: mocks.savePlanBody,
  approvePlan: mocks.approvePlan,
}));

import { registerLineageHandlers } from "@main/ipc/insight/lineage";

describe("registerLineageHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
    mocks.readPlan.mockResolvedValue({
      slug: "2026-06-29-plan-a",
      goal: "Need review",
      createdAt: "2026-06-29T00:00:00.000Z",
      status: "draft",
      body: "body",
    });
    mocks.savePlanBody.mockResolvedValue({
      slug: "2026-06-29-plan-a",
      goal: "Need review",
      createdAt: "2026-06-29T00:00:00.000Z",
      status: "draft",
      body: "new body",
    });
    mocks.approvePlan.mockResolvedValue({
      slug: "2026-06-29-plan-a",
      goal: "Need review",
      createdAt: "2026-06-29T00:00:00.000Z",
      status: "approved",
      body: "new body",
    });
    registerLineageHandlers();
  });

  function handler(
    channel: string
  ): (event: unknown, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("reads plans through projectId/sessionId/slug", async () => {
    const result = await handler(LineageChannels.readPlan)(
      {},
      {
        projectId: "project-1",
        sessionId: "session-1",
        slug: "2026-06-29-plan-a",
      }
    );

    expect(mocks.resolveProjectPath).toHaveBeenCalledWith("project-1");
    expect(mocks.readPlan).toHaveBeenCalledWith("/tmp/project", "session-1", "2026-06-29-plan-a");
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ slug: "2026-06-29-plan-a" }),
    });
  });

  it("saves and approves plans through dedicated channels", async () => {
    await expect(
      handler(LineageChannels.savePlanBody)(
        {},
        {
          projectId: "project-1",
          sessionId: "session-1",
          slug: "2026-06-29-plan-a",
          body: "new body",
        }
      )
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ body: "new body" }),
    });
    expect(mocks.savePlanBody).toHaveBeenCalledWith(
      "/tmp/project",
      "session-1",
      "2026-06-29-plan-a",
      "new body"
    );

    await expect(
      handler(LineageChannels.approvePlan)(
        {},
        {
          projectId: "project-1",
          sessionId: "session-1",
          slug: "2026-06-29-plan-a",
        }
      )
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ status: "approved" }),
    });
    expect(mocks.approvePlan).toHaveBeenCalledWith(
      "/tmp/project",
      "session-1",
      "2026-06-29-plan-a"
    );
  });

  it("rejects invalid plan slug before calling services", async () => {
    const result = await handler(LineageChannels.readPlan)(
      {},
      {
        projectId: "project-1",
        sessionId: "session-1",
        slug: "../secret",
      }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
    expect(mocks.readPlan).not.toHaveBeenCalled();
  });
});

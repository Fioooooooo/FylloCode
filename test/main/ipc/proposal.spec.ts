import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ProposalChannels } from "@shared/types/channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  watchProposal: vi.fn(),
}));

vi.mock("@main/infra/storage/project-store", () => ({
  loadProject: mocks.loadProject,
}));

vi.mock("@main/services/proposal/proposal-status-service", () => ({
  proposalStatusService: {
    watchProposal: mocks.watchProposal,
  },
}));

import { registerProposalHandlers } from "@main/ipc/proposal";

describe("registerProposalHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("watches a proposal by projectId/changeId/sessionId", async () => {
    registerProposalHandlers();
    mocks.loadProject.mockResolvedValue({ id: "project-1", path: "/tmp/project" });

    const result = await handler(ProposalChannels.watch)(
      {},
      {
        projectId: "project-1",
        changeId: "change-1",
        sessionId: "session-1",
      }
    );

    expect(mocks.loadProject).toHaveBeenCalledWith("project-1");
    expect(mocks.watchProposal).toHaveBeenCalledWith("/tmp/project", "change-1", "session-1");
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("rejects watch when project is not found", async () => {
    registerProposalHandlers();
    mocks.loadProject.mockResolvedValue(null);

    const result = await handler(ProposalChannels.watch)(
      {},
      {
        projectId: "missing-project",
        changeId: "change-1",
        sessionId: "session-1",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROJECT_NOT_FOUND");
    }
  });
});

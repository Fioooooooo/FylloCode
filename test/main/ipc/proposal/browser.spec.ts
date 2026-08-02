import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ProposalBrowserChannels as ProposalChannels } from "@shared/ipc/proposal/browser.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";

const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  listProposals: vi.fn(),
  readProposalFile: vi.fn(),
  getProposalSpecDeltas: vi.fn(),
  watchProposal: vi.fn(),
  statusChangedListener: null as ((payload: unknown) => void) | null,
}));

vi.mock("@main/services/workspace/resolver/workspace-resolver", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@main/services/proposal/browser/proposal-status-service", () => ({
  proposalStatusService: {
    watchProposal: mocks.watchProposal,
    onStatusChanged: vi.fn((listener: (payload: unknown) => void) => {
      mocks.statusChangedListener = listener;
      return vi.fn();
    }),
  },
}));

vi.mock("@main/services/proposal/browser/proposal-service", () => ({
  listProposals: mocks.listProposals,
  readProposalFile: mocks.readProposalFile,
  getProposalSpecDeltas: mocks.getProposalSpecDeltas,
}));

import { registerProposalHandlers, setupProposalStatusBroadcast } from "@main/ipc/proposal/browser";

describe("registerProposalHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statusChangedListener = null;
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

  it("watches a proposal by workspaceId/changeId/sessionId", async () => {
    registerProposalHandlers();
    mocks.resolveWorkspace.mockResolvedValue({ workspaceId: "workspace-1", cwd: "/tmp/project" });

    const result = await handler(ProposalChannels.watch)(
      {},
      {
        workspaceId: "workspace-1",
        changeId: "change-1",
        sessionId: "session-1",
      }
    );

    expect(mocks.resolveWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(mocks.watchProposal).toHaveBeenCalledWith(
      "workspace-1",
      "/tmp/project",
      "change-1",
      "session-1"
    );
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("routes proposal status updates to the matching project window", () => {
    const manager = {
      sendToWorkspace: vi.fn(),
    } as unknown as WorkspaceWindowManager;

    setupProposalStatusBroadcast(manager);
    expect(mocks.statusChangedListener).toBeTypeOf("function");

    mocks.statusChangedListener?.({
      workspaceId: "workspace-1",
      changeId: "change-1",
      sessionId: "session-1",
      projectPath: "/tmp/project",
      status: "draft",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(manager.sendToWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      ProposalChannels.statusChanged,
      expect.objectContaining({ workspaceId: "workspace-1", changeId: "change-1" })
    );
  });

  it("rejects watch when Workspace is not found", async () => {
    registerProposalHandlers();
    mocks.resolveWorkspace.mockRejectedValue(
      Object.assign(new Error("Workspace does not exist"), { code: "WORKSPACE_NOT_FOUND" })
    );

    const result = await handler(ProposalChannels.watch)(
      {},
      {
        workspaceId: "missing-project",
        changeId: "change-1",
        sessionId: "session-1",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("WORKSPACE_NOT_FOUND");
    }
  });

  it("returns proposal spec deltas", async () => {
    registerProposalHandlers();
    mocks.getProposalSpecDeltas.mockResolvedValue({
      items: [
        {
          id: "proposal-detail",
          purpose: "Detail delta",
          sourcePath: "specs/proposal-detail/spec.md",
          deltaTypes: ["ADDED"],
          requirementsCount: 1,
          scenariosCount: 0,
          requirementGroups: [],
        },
      ],
    });

    const result = await handler(ProposalChannels.getSpecDeltas)(
      {},
      {
        workspaceId: "workspace-1",
        changeId: "change-1",
      }
    );

    expect(mocks.getProposalSpecDeltas).toHaveBeenCalledWith("workspace-1", "change-1");
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          expect.objectContaining({
            id: "proposal-detail",
            deltaTypes: ["ADDED"],
          }),
        ],
      },
    });
  });

  it("returns PROJECT_NOT_FOUND when proposal spec deltas cannot resolve project", async () => {
    registerProposalHandlers();
    mocks.getProposalSpecDeltas.mockRejectedValue(
      Object.assign(new Error("Project not found: missing-project"), {
        code: "PROJECT_NOT_FOUND",
      })
    );

    const result = await handler(ProposalChannels.getSpecDeltas)(
      {},
      {
        workspaceId: "missing-project",
        changeId: "change-1",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROJECT_NOT_FOUND");
    }
  });

  it("rejects proposal spec deltas with invalid input", async () => {
    registerProposalHandlers();

    const result = await handler(ProposalChannels.getSpecDeltas)(
      {},
      {
        workspaceId: "",
        changeId: "change-1",
      }
    );

    expect(mocks.getProposalSpecDeltas).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { ProposalBrowserChannels as ProposalChannels } from "@shared/ipc/proposal/browser.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";

const mocks = vi.hoisted(() => ({
  listProposals: vi.fn(),
  readProposalFile: vi.fn(),
  getProposalSpecDeltas: vi.fn(),
  resolveProposalMeta: vi.fn(),
  watchProposal: vi.fn(),
  statusChangedListener: null as ((payload: unknown) => void) | null,
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
  resolveProposalMeta: mocks.resolveProposalMeta,
}));

import { registerProposalHandlers, setupProposalStatusBroadcast } from "@main/ipc/proposal/browser";

describe("proposal browser IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statusChangedListener = null;
  });

  function handler(
    channel: string
  ): (event: unknown, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([value]) => value === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("watches a proposal by Workspace and ProposalRef", async () => {
    registerProposalHandlers();
    mocks.resolveProposalMeta.mockResolvedValue({ worktreePath: "/repo-b/.worktrees/change-1" });
    const input = {
      workspaceId: "workspace-1",
      folderId: "folder-b",
      changeId: "change-1",
      sessionId: "session-1",
    };

    const result = await handler(ProposalChannels.watch)({}, input);

    expect(mocks.watchProposal).toHaveBeenCalledWith(
      "workspace-1",
      { folderId: "folder-b", changeId: "change-1" },
      "/repo-b/.worktrees/change-1",
      "session-1"
    );
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("returns the per-Folder proposal aggregate", async () => {
    registerProposalHandlers();
    const overview = {
      folders: [],
      items: [],
      completeness: "partial",
      excludedFolderIds: ["folder-b"],
    };
    mocks.listProposals.mockResolvedValue(overview);

    const result = await handler(ProposalChannels.list)({}, { workspaceId: "workspace-1" });

    expect(mocks.listProposals).toHaveBeenCalledWith("workspace-1");
    expect(result).toEqual({ ok: true, data: overview });
  });

  it("routes owner-qualified status updates to the matching Workspace", () => {
    const manager = { sendToWorkspace: vi.fn() } as unknown as WorkspaceWindowManager;
    setupProposalStatusBroadcast(manager);
    const payload = {
      workspaceId: "workspace-1",
      proposalRef: { folderId: "folder-b", changeId: "change-1" },
      sessionId: "session-1",
      status: "draft",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    mocks.statusChangedListener?.(payload);
    expect(manager.sendToWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      ProposalChannels.statusChanged,
      payload
    );
  });

  it("passes ProposalRef to the spec delta service", async () => {
    registerProposalHandlers();
    mocks.getProposalSpecDeltas.mockResolvedValue({ items: [] });
    const result = await handler(ProposalChannels.getSpecDeltas)(
      {},
      {
        workspaceId: "workspace-1",
        folderId: "folder-b",
        changeId: "change-1",
      }
    );
    expect(mocks.getProposalSpecDeltas).toHaveBeenCalledWith("workspace-1", {
      folderId: "folder-b",
      changeId: "change-1",
    });
    expect(result).toEqual({ ok: true, data: { items: [] } });
  });

  it("rejects an executable selector without folderId", async () => {
    registerProposalHandlers();
    const result = await handler(ProposalChannels.getSpecDeltas)(
      {},
      {
        workspaceId: "workspace-1",
        changeId: "change-1",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

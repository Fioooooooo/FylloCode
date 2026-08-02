import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalApplyChannels } from "@shared/ipc/proposal/apply.channels";
import { ProposalArchiveChannels } from "@shared/ipc/proposal/archive.channels";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock("electron", () => ({ ipcRenderer: mocks.ipcRenderer }));

const proposalRef = { folderId: "folder-b", changeId: "same-change" };

describe("preload proposal owner contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("forwards ProposalRef for browser detail operations", async () => {
    const { proposalBrowserApi } = await import("@preload/api/proposal/browser");
    await proposalBrowserApi.readFile("workspace-1", proposalRef, "proposal.md");
    await proposalBrowserApi.getSpecDeltas("workspace-1", proposalRef);

    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, ProposalBrowserChannels.readFile, {
      workspaceId: "workspace-1",
      ...proposalRef,
      filename: "proposal.md",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2,
      ProposalBrowserChannels.getSpecDeltas,
      { workspaceId: "workspace-1", ...proposalRef }
    );
  });

  it("forwards ProposalRef for apply and archive history", async () => {
    const { proposalApplyApi } = await import("@preload/api/proposal/apply");
    const { proposalArchiveApi } = await import("@preload/api/proposal/archive");
    await proposalApplyApi.loadRun({ workspaceId: "workspace-1", ...proposalRef });
    await proposalArchiveApi.loadArchive({ workspaceId: "workspace-1", ...proposalRef });

    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, ProposalApplyChannels.loadRun, {
      workspaceId: "workspace-1",
      ...proposalRef,
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2,
      ProposalArchiveChannels.loadArchive,
      { workspaceId: "workspace-1", ...proposalRef }
    );
  });
});

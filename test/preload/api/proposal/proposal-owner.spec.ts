import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("forwards Workspace identity for proposal aggregate listing", async () => {
    const { proposalBrowserApi } = await import("@preload/api/proposal/browser");
    await proposalBrowserApi.list("workspace-1");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(ProposalBrowserChannels.list, {
      workspaceId: "workspace-1",
    });
  });
});

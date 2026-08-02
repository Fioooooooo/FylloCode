import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectSessions: vi.fn(),
  hasProposal: vi.fn(),
  hasActions: vi.fn(),
  hasPreview: vi.fn(),
}));

vi.mock("@main/services/session/_public", () => ({
  inspectSessionWorkspaceFolderReferences: mocks.inspectSessions,
}));
vi.mock("@main/services/proposal/_public", () => ({
  hasActiveProposalWorkspaceReferences: mocks.hasProposal,
}));
vi.mock("@main/services/automation/_public", () => ({
  hasPendingWorkspaceActions: mocks.hasActions,
}));
vi.mock("@main/services/workspace/document/local-file-preview-service", () => ({
  localFilePreviewService: { hasPendingWorkspaceDispatch: mocks.hasPreview },
}));

import { inspectWorkspaceFolderReferences } from "@main/services/workspace/workspace/workspace-reference-inspector";

describe("workspace-reference-inspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectSessions.mockResolvedValue({ activeReferences: [], historicalSessions: [] });
    mocks.hasProposal.mockReturnValue(false);
    mocks.hasActions.mockResolvedValue(false);
    mocks.hasPreview.mockReturnValue(false);
  });

  it("aggregates active domain references while preserving historical Sessions", async () => {
    mocks.inspectSessions.mockResolvedValue({
      activeReferences: [{ kind: "chat", workspaceId: "workspace-1", folderId: "folder-1" }],
      historicalSessions: [
        { workspaceId: "workspace-1", folderId: "folder-1", sessionId: "session-old" },
      ],
    });
    mocks.hasProposal.mockReturnValue(true);
    mocks.hasActions.mockResolvedValue(true);
    mocks.hasPreview.mockReturnValue(true);

    await expect(inspectWorkspaceFolderReferences("workspace-1", "folder-1")).resolves.toEqual({
      activeReferences: [
        { kind: "chat", workspaceId: "workspace-1", folderId: "folder-1" },
        { kind: "proposal-watcher", workspaceId: "workspace-1", folderId: "folder-1" },
        { kind: "pending-action", workspaceId: "workspace-1", folderId: "folder-1" },
        { kind: "preview-dispatch", workspaceId: "workspace-1", folderId: "folder-1" },
      ],
      historicalSessions: [
        { workspaceId: "workspace-1", folderId: "folder-1", sessionId: "session-old" },
      ],
    });
  });

  it("does not inspect task targets as active references", async () => {
    await inspectWorkspaceFolderReferences("workspace-1", "folder-2");
    expect(mocks.inspectSessions).toHaveBeenCalledWith("workspace-1", "folder-2");
    expect(mocks.hasActions).toHaveBeenCalledWith("workspace-1", "folder-2");
  });
});

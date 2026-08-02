import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSessionMetas: vi.fn(),
  listWorkspace: vi.fn(),
  hasWorkspace: vi.fn(),
}));

vi.mock("@main/infra/storage/session-store", () => ({
  listSessionMetas: mocks.listSessionMetas,
}));
vi.mock("@main/services/session/chat/session-registry", () => ({
  sessionRegistry: { listWorkspace: mocks.listWorkspace },
}));
vi.mock("@main/services/session/chat/session-probe-registry", () => ({
  sessionProbeRegistry: { hasWorkspace: mocks.hasWorkspace },
}));

import { inspectSessionWorkspaceFolderReferences } from "@main/services/session/chat/workspace-folder-reference";

describe("Session Workspace Folder references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasWorkspace.mockReturnValue(false);
    mocks.listWorkspace.mockReturnValue([]);
    mocks.listSessionMetas.mockResolvedValue([
      {
        sessionId: "session-active",
        title: "Active",
        workspaceSnapshot: { folders: [{ folderId: "folder-1" }] },
      },
      {
        sessionId: "session-old",
        title: "Old",
        workspaceSnapshot: { folders: [{ folderId: "folder-1" }] },
      },
      {
        sessionId: "other-folder",
        title: "Other",
        workspaceSnapshot: { folders: [{ folderId: "folder-2" }] },
      },
    ]);
  });

  it("separates same-Folder active chat from historical Sessions", async () => {
    mocks.listWorkspace.mockReturnValue([
      { owner: "chat", key: "workspace-1:session-active" },
      { owner: "chat", key: "workspace-1:other-folder" },
    ]);

    await expect(
      inspectSessionWorkspaceFolderReferences("workspace-1", "folder-1")
    ).resolves.toEqual({
      activeReferences: [
        {
          kind: "chat",
          workspaceId: "workspace-1",
          folderId: "folder-1",
          sessionId: "session-active",
        },
      ],
      historicalSessions: [
        {
          workspaceId: "workspace-1",
          folderId: "folder-1",
          sessionId: "session-old",
          sessionName: "Old",
        },
      ],
    });
  });
});

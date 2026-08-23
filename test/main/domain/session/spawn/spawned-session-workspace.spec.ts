import { describe, expect, it } from "vitest";
import {
  assertSpawnedSessionScopeSnapshot,
  deriveSpawnedSessionWorkspaceSnapshot,
  formatAuthorizedFolderList,
} from "@main/domain/session/spawn/spawned-session-workspace";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

function snapshot(overrides: Partial<SessionWorkspaceSnapshot> = {}): SessionWorkspaceSnapshot {
  return {
    workspaceId: "workspace-1",
    workspaceKind: "collection",
    primaryFolderId: "folder-primary",
    folders: [
      { folderId: "folder-primary", folderName: "Primary", folderPath: "/repos/primary" },
      { folderId: "folder-secondary", folderName: "Secondary", folderPath: "/repos/secondary" },
    ],
    cwd: "/repos/primary",
    additionalDirectories: ["/repos/secondary"],
    ...overrides,
  };
}

describe("spawned-session-workspace", () => {
  it("inherits the complete parent snapshot when folderId is omitted", () => {
    const parent = snapshot();

    expect(deriveSpawnedSessionWorkspaceSnapshot(parent)).toEqual(parent);
  });

  it("derives a secondary Folder without implicitly retaining the primary", () => {
    expect(deriveSpawnedSessionWorkspaceSnapshot(snapshot(), "folder-secondary")).toEqual({
      workspaceId: "workspace-1",
      workspaceKind: "collection",
      primaryFolderId: "folder-secondary",
      folders: [
        { folderId: "folder-secondary", folderName: "Secondary", folderPath: "/repos/secondary" },
      ],
      cwd: "/repos/secondary",
      additionalDirectories: [],
    });
  });

  it("rejects an unknown Folder and formats only opaque ID/name choices", () => {
    const parent = snapshot();

    expect(() => deriveSpawnedSessionWorkspaceSnapshot(parent, "missing")).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_FOLDER" })
    );
    expect(formatAuthorizedFolderList(parent)).toBe(
      "folder-primary (Primary), folder-secondary (Secondary)"
    );
    expect(formatAuthorizedFolderList(parent)).not.toContain("/repos/");
  });

  it("rejects persisted scope identity or path changes", () => {
    const parent = snapshot();

    expect(() =>
      assertSpawnedSessionScopeSnapshot(
        parent,
        {
          ...deriveSpawnedSessionWorkspaceSnapshot(parent, "folder-secondary"),
          workspaceId: "other",
        },
        { kind: "folder", folderId: "folder-secondary", name: "Secondary" }
      )
    ).toThrowError(expect.objectContaining({ code: "SCOPE_IDENTITY_MISMATCH" }));

    expect(() =>
      assertSpawnedSessionScopeSnapshot(
        parent,
        {
          ...deriveSpawnedSessionWorkspaceSnapshot(parent, "folder-secondary"),
          folders: [
            {
              folderId: "folder-secondary",
              folderName: "Secondary",
              folderPath: "/repos/relocated",
            },
          ],
          cwd: "/repos/relocated",
        },
        { kind: "folder", folderId: "folder-secondary", name: "Secondary" }
      )
    ).toThrowError(expect.objectContaining({ code: "SCOPE_SNAPSHOT_MISMATCH" }));
  });

  it("does not fall back to the primary Folder for a missing selection", () => {
    const parent = snapshot();

    expect(() => deriveSpawnedSessionWorkspaceSnapshot(parent, "not-authorized")).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_FOLDER" })
    );
  });
});

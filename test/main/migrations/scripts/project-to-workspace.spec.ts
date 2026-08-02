import { describe, expect, it } from "vitest";
import {
  planProjectWorkspaceCutover,
  WorkspaceCutoverPreflightError,
  type WorkspaceCutoverDependencies,
} from "@main/migrations/scripts/20260802_001_project-to-workspace";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const LAST_OPENED_AT = "2026-08-02T00:00:00.000Z";

function legacyProject(
  id: string,
  path: string,
  overrides: Partial<LegacyProjectMeta> = {}
): LegacyProjectMeta {
  return {
    id,
    name: `Project ${id}`,
    path,
    createdAt: CREATED_AT,
    lastOpenedAt: LAST_OPENED_AT,
    ...overrides,
  };
}

function dependencies({
  projects,
  canonicalPaths = {},
  workspaces = {},
  folders = {},
}: {
  projects: LegacyProjectMeta[];
  canonicalPaths?: Record<string, string | Error>;
  workspaces?: Record<string, WorkspaceMeta>;
  folders?: Record<string, FolderMeta>;
}): WorkspaceCutoverDependencies {
  return {
    listLegacyProjects: async () => projects,
    loadWorkspace: async (workspaceId) => workspaces[workspaceId] ?? null,
    loadFolder: async (folderId) => folders[folderId] ?? null,
    listFolders: async () => Object.values(folders),
    realpath: async (path) => {
      const result = canonicalPaths[path];
      if (result instanceof Error) throw result;
      return result ?? path;
    },
    legacyProjectsDir: () => "/app-data/projects",
    workspaceDataDir: (workspaceId) => `/app-data/workspaces/${workspaceId}`,
    saveWorkspace: async () => undefined,
    saveFolder: async () => undefined,
  };
}

describe("Project-to-Workspace cutover preflight", () => {
  it("preserves a legacy ID that differs from the path candidate", async () => {
    const project = legacyProject("stable-id", "/repos/example", { healthScore: 93 });

    const [plan] = await planProjectWorkspaceCutover(
      dependencies({
        projects: [project],
        canonicalPaths: { "/repos/example": "/canonical/example" },
      })
    );

    expect(plan.candidateLegacyAppDataKey).toBe("repos-example");
    expect(plan.legacySourceDir).toBe("/app-data/projects/repos-example");
    expect(plan.folder).toEqual({
      version: 1,
      id: "stable-id",
      name: "Project stable-id",
      path: "/canonical/example",
      healthScore: 93,
    });
    expect(plan.workspace).toMatchObject({
      id: "stable-id",
      kind: "folder",
      folderIds: ["stable-id"],
      primaryFolderId: "stable-id",
      legacyAppDataKey: "repos-example",
    });
  });

  it("reports every legacy ID that resolves to the same canonical path", async () => {
    const first = legacyProject("first", "/repos/first");
    const second = legacyProject("second", "/repos/second");

    const result = planProjectWorkspaceCutover(
      dependencies({
        projects: [first, second],
        canonicalPaths: {
          "/repos/first": "/canonical/shared",
          "/repos/second": "/canonical/shared",
        },
      })
    );

    await expect(result).rejects.toMatchObject({
      conflicts: [
        {
          type: "legacy-canonical-path",
          canonicalPath: "/canonical/shared",
          projectIds: ["first", "second"],
        },
      ],
    });
  });

  it("allows a lossy candidate collision but omits source ownership provenance", async () => {
    const plans = await planProjectWorkspaceCutover(
      dependencies({
        projects: [
          legacyProject("first", "/repos/my-app"),
          legacyProject("second", "/repos/my/app"),
        ],
      })
    );

    expect(plans.map((plan) => plan.legacySourceDir)).toEqual([
      "/app-data/projects/repos-my-app",
      "/app-data/projects/repos-my-app",
    ]);
    expect(plans.every((plan) => plan.workspace.legacyAppDataKey === undefined)).toBe(true);
  });

  it("accepts a consistent partial target", async () => {
    const project = legacyProject("existing", "/repos/existing");
    const existingFolder: FolderMeta = {
      version: 1,
      id: "existing",
      name: project.name,
      path: project.path,
    };

    await expect(
      planProjectWorkspaceCutover(
        dependencies({ projects: [project], folders: { existing: existingFolder } })
      )
    ).resolves.toHaveLength(1);
  });

  it("rejects conflicting Workspace and Folder targets", async () => {
    const project = legacyProject("existing", "/repos/existing");
    const conflictingWorkspace: WorkspaceMeta = {
      version: 2,
      id: "existing",
      name: "Different name",
      kind: "folder",
      isDeleted: false,
      legacyAppDataKey: "repos-existing",
      folderIds: ["existing"],
      primaryFolderId: "existing",
      createdAt: CREATED_AT,
      lastOpenedAt: LAST_OPENED_AT,
    };
    const conflictingFolder: FolderMeta = {
      version: 1,
      id: "existing",
      name: "Different name",
      path: project.path,
    };

    const result = planProjectWorkspaceCutover(
      dependencies({
        projects: [project],
        workspaces: { existing: conflictingWorkspace },
        folders: { existing: conflictingFolder },
      })
    );

    await expect(result).rejects.toBeInstanceOf(WorkspaceCutoverPreflightError);
    await expect(result).rejects.toMatchObject({
      conflicts: expect.arrayContaining([
        { type: "workspace-target", projectId: "existing" },
        { type: "folder-target", projectId: "existing" },
      ]),
    });
  });

  it("rejects an existing Folder owner for the legacy canonical path", async () => {
    const project = legacyProject("legacy", "/repos/legacy");
    const registeredFolder: FolderMeta = {
      version: 1,
      id: "registered",
      name: "Registered",
      path: "/repos/registered-alias",
    };

    const result = planProjectWorkspaceCutover(
      dependencies({
        projects: [project],
        folders: { registered: registeredFolder },
        canonicalPaths: {
          "/repos/legacy": "/canonical/shared",
          "/repos/registered-alias": "/canonical/shared",
        },
      })
    );

    await expect(result).rejects.toMatchObject({
      conflicts: expect.arrayContaining([
        {
          type: "legacy-folder-registry-canonical-path",
          canonicalPath: "/canonical/shared",
          projectId: "legacy",
          folderId: "registered",
        },
      ]),
    });
  });

  it("keeps the last known path when the legacy Folder is missing", async () => {
    const project = legacyProject("missing", "/repos/missing");

    const [plan] = await planProjectWorkspaceCutover(
      dependencies({
        projects: [project],
        canonicalPaths: { "/repos/missing": new Error("ENOENT") },
      })
    );

    expect(plan.pathMissing).toBe(true);
    expect(plan.folder.path).toBe("/repos/missing");
  });

  it("rejects duplicate legacy IDs before any migration write can begin", async () => {
    const result = planProjectWorkspaceCutover(
      dependencies({
        projects: [
          legacyProject("duplicate", "/repos/first"),
          legacyProject("duplicate", "/repos/second"),
        ],
      })
    );

    await expect(result).rejects.toMatchObject({
      conflicts: expect.arrayContaining([
        {
          type: "legacy-id",
          projectId: "duplicate",
          paths: ["/repos/first", "/repos/second"],
        },
      ]),
    });
  });
});

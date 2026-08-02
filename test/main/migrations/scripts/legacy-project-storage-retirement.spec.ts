import { describe, expect, it, vi } from "vitest";
import {
  buildLegacyProjectCleanupPlan,
  LegacyProjectSettlementPreflightError,
  migrateLegacyProjectStorageSettlement,
  preflightLegacyProjectSettlement,
  type LegacyProjectSettlementDependencies,
} from "@main/migrations/scripts/20260804_001_retire-legacy-project-storage";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta } from "@shared/types/workspace";
import type { WorkspaceMeta } from "@shared/types/workspace";

function workspace(
  id: string,
  legacyAppDataKey?: string,
  overrides: Partial<WorkspaceMeta> = {}
): WorkspaceMeta {
  return {
    version: 2,
    id,
    name: id,
    kind: "folder",
    isDeleted: false,
    folderIds: [id],
    primaryFolderId: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
    ...(legacyAppDataKey ? { legacyAppDataKey } : {}),
    ...overrides,
  };
}

function project(id: string): LegacyProjectMeta {
  return {
    id,
    name: id,
    path: `/repo/${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
  };
}

function folder(id: string): FolderMeta {
  return { version: 1, id, name: id, path: `/repo/${id}` };
}

function dependencies(
  overrides: Partial<LegacyProjectSettlementDependencies> = {}
): LegacyProjectSettlementDependencies {
  return {
    oldCutoverSucceeded: async () => true,
    repairCutover: async () => undefined,
    listLegacyProjects: async () => [project("workspace-a")],
    listWorkspaces: async () => [workspace("workspace-a", "data-a")],
    loadFolder: async (id) => folder(id),
    deleteLegacyProjectDataByAppDataKey: async () => undefined,
    deleteLegacyProjectMetaRecord: async () => undefined,
    saveWorkspace: async () => undefined,
    ...overrides,
  };
}

describe("buildLegacyProjectCleanupPlan", () => {
  it("uses only persisted provenance and sorts by Workspace ID", () => {
    const plans = buildLegacyProjectCleanupPlan([
      workspace("workspace-b", "data-b"),
      workspace("workspace-orphan"),
      workspace("workspace-a", "data-a"),
    ]);

    expect(
      plans.map(({ workspaceId, legacyAppDataKey }) => ({ workspaceId, legacyAppDataKey }))
    ).toEqual([
      { workspaceId: "workspace-a", legacyAppDataKey: "data-a" },
      { workspaceId: "workspace-b", legacyAppDataKey: "data-b" },
    ]);
  });

  it("allows the explicit data key to equal the Workspace ID", () => {
    expect(buildLegacyProjectCleanupPlan([workspace("workspace-a", "workspace-a")])).toHaveLength(
      1
    );
  });

  it("rejects duplicate provenance before returning a plan", () => {
    expect(() =>
      buildLegacyProjectCleanupPlan([
        workspace("workspace-a", "shared-key"),
        workspace("workspace-b", "shared-key"),
      ])
    ).toThrowError(LegacyProjectSettlementPreflightError);

    try {
      buildLegacyProjectCleanupPlan([
        workspace("workspace-a", "shared-key"),
        workspace("workspace-b", "shared-key"),
      ]);
    } catch (error) {
      expect((error as LegacyProjectSettlementPreflightError).conflicts).toEqual([
        {
          type: "duplicate-legacy-app-data-key",
          legacyAppDataKey: "shared-key",
          workspaceIds: ["workspace-a", "workspace-b"],
        },
      ]);
    }
  });

  it.each(["", ".", "..", "nested/path", "nested\\path", "bad\0key"])(
    "rejects unsafe provenance key %j",
    (legacyAppDataKey) => {
      const candidate = workspace("workspace-a", "safe");
      candidate.legacyAppDataKey = legacyAppDataKey;
      expect(() => buildLegacyProjectCleanupPlan([candidate])).toThrowError(
        LegacyProjectSettlementPreflightError
      );
    }
  );
});

describe("preflightLegacyProjectSettlement", () => {
  it("validates mutable tombstones by stable Folder Workspace identity", async () => {
    const tombstone = workspace("workspace-a", "data-a", {
      name: "Renamed",
      isDeleted: true,
      deletedAt: "2026-08-02T00:00:00.000Z",
      cleanupState: "restorable",
    });

    await expect(
      preflightLegacyProjectSettlement(dependencies({ listWorkspaces: async () => [tombstone] }))
    ).resolves.toMatchObject([{ workspaceId: "workspace-a", legacyAppDataKey: "data-a" }]);
  });

  it("fails before cleanup when any legacy target is missing", async () => {
    await expect(
      preflightLegacyProjectSettlement(
        dependencies({ listWorkspaces: async () => [], loadFolder: async () => null })
      )
    ).rejects.toMatchObject({
      conflicts: [{ type: "missing-workspace-target", workspaceId: "workspace-a" }],
    });
  });
});

describe("migrateLegacyProjectStorageSettlement", () => {
  it("skips cutover replay after success and clears provenance last", async () => {
    const calls: string[] = [];
    const saveWorkspace = async (meta: WorkspaceMeta): Promise<void> => {
      calls.push("save-workspace");
      expect(meta).toMatchObject({ id: "workspace-a", name: "workspace-a" });
      expect(meta).not.toHaveProperty("legacyAppDataKey");
    };
    const repairCutover = async (): Promise<void> => {
      calls.push("repair-cutover");
    };

    await migrateLegacyProjectStorageSettlement(
      dependencies({
        repairCutover,
        deleteLegacyProjectDataByAppDataKey: async () => {
          calls.push("delete-source");
        },
        deleteLegacyProjectMetaRecord: async () => {
          calls.push("delete-meta");
        },
        saveWorkspace,
      })
    );

    expect(calls).toEqual(["delete-source", "delete-meta", "save-workspace"]);
  });

  it("replays the released cutover only when it has not succeeded", async () => {
    const repairCutover = vi.fn().mockResolvedValue(undefined);

    await migrateLegacyProjectStorageSettlement(
      dependencies({ oldCutoverSucceeded: async () => false, repairCutover })
    );

    expect(repairCutover).toHaveBeenCalledOnce();
  });

  it("performs zero deletes when preflight fails", async () => {
    const deleteSource = vi.fn().mockResolvedValue(undefined);
    await expect(
      migrateLegacyProjectStorageSettlement(
        dependencies({
          listWorkspaces: async () => [],
          loadFolder: async () => null,
          deleteLegacyProjectDataByAppDataKey: deleteSource,
        })
      )
    ).rejects.toBeInstanceOf(LegacyProjectSettlementPreflightError);
    expect(deleteSource).not.toHaveBeenCalled();
  });

  it.each([
    ["source", "deleteLegacyProjectDataByAppDataKey"],
    ["meta", "deleteLegacyProjectMetaRecord"],
    ["workspace", "saveWorkspace"],
  ] as const)("propagates a %s failure for retry", async (_label, failingStep) => {
    await expect(
      migrateLegacyProjectStorageSettlement(
        dependencies({
          [failingStep]: async () => {
            throw new Error(`${failingStep} failed`);
          },
        })
      )
    ).rejects.toThrow(`${failingStep} failed`);
  });

  it("retains unowned collision/orphan data by never issuing a delete", async () => {
    const deleteSource = vi.fn().mockResolvedValue(undefined);
    await migrateLegacyProjectStorageSettlement(
      dependencies({
        listLegacyProjects: async () => [project("workspace-a"), project("workspace-b")],
        listWorkspaces: async () => [workspace("workspace-a"), workspace("workspace-b")],
        deleteLegacyProjectDataByAppDataKey: deleteSource,
      })
    );
    expect(deleteSource).not.toHaveBeenCalled();
  });
});

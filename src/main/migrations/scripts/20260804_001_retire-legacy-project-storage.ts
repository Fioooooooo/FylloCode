import { getDataSubPath } from "@main/infra/paths";
import { loadFolder } from "@main/infra/storage/folder-store";
import { listWorkspaces, saveWorkspace } from "@main/infra/storage/workspace-store";
import {
  assertLegacyProjectAppDataKey,
  deleteLegacyProjectDataByAppDataKey,
  deleteLegacyProjectMetaRecord,
  listLegacyProjects,
} from "@main/migrations/legacy-project-store";
import { readMigrationStore } from "@main/migrations/store";
import {
  migrateProjectWorkspaceCutover,
  WORKSPACE_CUTOVER_MIGRATION_ID,
} from "./20260802_001_project-to-workspace";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

export const WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID =
  "20260804_001_retire-legacy-project-storage" as const;

export interface LegacyProjectCleanupPlanItem {
  workspaceId: string;
  legacyAppDataKey: string;
  workspace: WorkspaceMeta;
}

export class LegacyProjectSettlementPreflightError extends Error {
  constructor(
    message: string,
    public readonly conflicts: Array<Record<string, unknown>>
  ) {
    super(message);
    this.name = "LegacyProjectSettlementPreflightError";
  }
}

export interface LegacyProjectSettlementDependencies {
  oldCutoverSucceeded(): Promise<boolean>;
  repairCutover(): Promise<void>;
  listLegacyProjects(): Promise<LegacyProjectMeta[]>;
  listWorkspaces(): Promise<WorkspaceMeta[]>;
  loadFolder(folderId: string): Promise<FolderMeta | null>;
  deleteLegacyProjectDataByAppDataKey(legacyAppDataKey: string): Promise<void>;
  deleteLegacyProjectMetaRecord(workspaceId: string): Promise<void>;
  saveWorkspace(workspace: WorkspaceMeta): Promise<void>;
}

async function oldCutoverSucceeded(): Promise<boolean> {
  const store = await readMigrationStore(getDataSubPath("migrations"));
  if (store.baselineId && store.baselineId >= WORKSPACE_CUTOVER_MIGRATION_ID) return true;
  return store.executed.some(
    (record) => record.id === WORKSPACE_CUTOVER_MIGRATION_ID && record.status === "success"
  );
}

const defaultDependencies: LegacyProjectSettlementDependencies = {
  oldCutoverSucceeded,
  repairCutover: migrateProjectWorkspaceCutover,
  listLegacyProjects,
  listWorkspaces,
  loadFolder,
  deleteLegacyProjectDataByAppDataKey,
  deleteLegacyProjectMetaRecord,
  saveWorkspace,
};

export function buildLegacyProjectCleanupPlan(
  workspaces: readonly WorkspaceMeta[]
): LegacyProjectCleanupPlanItem[] {
  const plans: LegacyProjectCleanupPlanItem[] = [];
  const ownerByAppDataKey = new Map<string, string>();
  const conflicts: Array<Record<string, unknown>> = [];

  for (const workspace of workspaces) {
    const legacyAppDataKey = workspace.legacyAppDataKey;
    if (legacyAppDataKey === undefined) continue;

    try {
      assertLegacyProjectAppDataKey(legacyAppDataKey);
    } catch (error) {
      conflicts.push({
        type: "unsafe-legacy-app-data-key",
        workspaceId: workspace.id,
        legacyAppDataKey,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const existingOwner = ownerByAppDataKey.get(legacyAppDataKey);
    if (existingOwner) {
      conflicts.push({
        type: "duplicate-legacy-app-data-key",
        legacyAppDataKey,
        workspaceIds: [existingOwner, workspace.id],
      });
      continue;
    }

    ownerByAppDataKey.set(legacyAppDataKey, workspace.id);
    plans.push({ workspaceId: workspace.id, legacyAppDataKey, workspace });
  }

  if (conflicts.length > 0) {
    throw new LegacyProjectSettlementPreflightError(
      `Legacy Project settlement preflight found ${conflicts.length} conflict(s)`,
      conflicts
    );
  }

  return plans.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
}

function hasStableFolderWorkspaceIdentity(
  workspace: WorkspaceMeta,
  folder: FolderMeta | null
): boolean {
  return (
    workspace.kind === "folder" &&
    workspace.folderIds.length === 1 &&
    workspace.folderIds[0] === workspace.id &&
    workspace.primaryFolderId === workspace.id &&
    folder?.id === workspace.id &&
    folder.path.length > 0
  );
}

export async function preflightLegacyProjectSettlement(
  dependencies: Pick<
    LegacyProjectSettlementDependencies,
    "listLegacyProjects" | "listWorkspaces" | "loadFolder"
  >
): Promise<LegacyProjectCleanupPlanItem[]> {
  const [legacyProjects, workspaces] = await Promise.all([
    dependencies.listLegacyProjects(),
    dependencies.listWorkspaces(),
  ]);
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const relevantWorkspaceIds = new Set([
    ...legacyProjects.map((project) => project.id),
    ...workspaces
      .filter((workspace) => workspace.legacyAppDataKey !== undefined)
      .map((workspace) => workspace.id),
  ]);
  const conflicts: Array<Record<string, unknown>> = [];

  for (const workspaceId of [...relevantWorkspaceIds].sort()) {
    const workspace = workspaceById.get(workspaceId);
    if (!workspace) {
      conflicts.push({ type: "missing-workspace-target", workspaceId });
      continue;
    }
    let folder: FolderMeta | null = null;
    try {
      folder = await dependencies.loadFolder(workspaceId);
    } catch (error) {
      conflicts.push({
        type: "folder-target-read",
        workspaceId,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!hasStableFolderWorkspaceIdentity(workspace, folder)) {
      conflicts.push({ type: "inconsistent-folder-workspace-target", workspaceId });
    }
  }

  let plans: LegacyProjectCleanupPlanItem[] = [];
  try {
    plans = buildLegacyProjectCleanupPlan(workspaces);
  } catch (error) {
    if (error instanceof LegacyProjectSettlementPreflightError) {
      conflicts.push(...error.conflicts);
    } else {
      throw error;
    }
  }

  if (conflicts.length > 0) {
    throw new LegacyProjectSettlementPreflightError(
      `Legacy Project settlement preflight found ${conflicts.length} conflict(s)`,
      conflicts
    );
  }
  return plans;
}

export async function migrateLegacyProjectStorageSettlement(
  dependencies: LegacyProjectSettlementDependencies = defaultDependencies
): Promise<void> {
  if (!(await dependencies.oldCutoverSucceeded())) {
    await dependencies.repairCutover();
  }

  const plans = await preflightLegacyProjectSettlement(dependencies);
  for (const plan of plans) {
    await dependencies.deleteLegacyProjectDataByAppDataKey(plan.legacyAppDataKey);
    await dependencies.deleteLegacyProjectMetaRecord(plan.workspaceId);
    const settledWorkspace = { ...plan.workspace };
    delete settledWorkspace.legacyAppDataKey;
    await dependencies.saveWorkspace(settledWorkspace);
  }
}

export async function migrate(): Promise<void> {
  await migrateLegacyProjectStorageSettlement();
}

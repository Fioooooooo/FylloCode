import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import logger from "@main/infra/logger";
import { loadFolder } from "@main/infra/storage/folder-store";
import { loadWorkspace } from "@main/infra/storage/workspace-store";
import { encodeProjectPath } from "@main/migrations/legacy-project-path";
import { listLegacyProjects } from "@main/migrations/legacy-project-store";
import { WORKSPACE_CUTOVER_MIGRATION_ID } from "@main/migrations/scripts/20260802_001_project-to-workspace";
import { readMigrationStore, writeMigrationStore, migrationStoreExists } from "./store";
import type { Migration, MigrationRecord, MigrationStore } from "./types";
import { getDataSubPath } from "@main/infra/paths";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

export type RequiredMigrationStatus =
  | { state: "success"; record: MigrationRecord }
  | { state: "failed"; record: MigrationRecord }
  | { state: "baseline"; baselineId: string }
  | { state: "pending"; baselineId?: string };

export interface WorkspaceCutoverValidationIssue {
  type: "required-migration" | "workspace-target" | "folder-target";
  workspaceId?: string;
  message: string;
}

export interface WorkspaceCutoverValidationResult {
  ok: boolean;
  status: RequiredMigrationStatus;
  issues: WorkspaceCutoverValidationIssue[];
}

export interface WorkspaceCutoverValidationDependencies {
  listLegacyProjects(): Promise<LegacyProjectMeta[]>;
  loadWorkspace(workspaceId: string): Promise<WorkspaceMeta | null>;
  loadFolder(folderId: string): Promise<FolderMeta | null>;
}

const defaultWorkspaceCutoverValidationDependencies: WorkspaceCutoverValidationDependencies = {
  listLegacyProjects,
  loadWorkspace,
  loadFolder,
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function shouldSkip(id: string, store: MigrationStore): boolean {
  if (store.baselineId && id <= store.baselineId) return true;
  return store.executed.some((r) => r.id === id);
}

export async function getRequiredMigrationStatus(id: string): Promise<RequiredMigrationStatus> {
  const store = await readMigrationStore(getDataSubPath("migrations"));
  const record = store.executed.find((candidate) => candidate.id === id);
  if (record) {
    return record.status === "success" ? { state: "success", record } : { state: "failed", record };
  }
  if (store.baselineId && store.baselineId >= id) {
    return { state: "baseline", baselineId: store.baselineId };
  }
  return {
    state: "pending",
    ...(store.baselineId ? { baselineId: store.baselineId } : {}),
  };
}

function matchesMigratedWorkspace(
  project: LegacyProjectMeta,
  workspace: WorkspaceMeta,
  candidateCount: number
): boolean {
  return (
    workspace.id === project.id &&
    workspace.name === project.name &&
    workspace.kind === "folder" &&
    workspace.isDeleted === false &&
    workspace.folderIds.length === 1 &&
    workspace.folderIds[0] === project.id &&
    workspace.primaryFolderId === project.id &&
    workspace.createdAt === project.createdAt &&
    workspace.lastOpenedAt === project.lastOpenedAt &&
    (candidateCount === 1
      ? workspace.legacyAppDataKey === encodeProjectPath(project.path)
      : workspace.legacyAppDataKey === undefined)
  );
}

function matchesMigratedFolder(project: LegacyProjectMeta, folder: FolderMeta): boolean {
  return (
    folder.id === project.id &&
    folder.name === project.name &&
    folder.path.length > 0 &&
    folder.healthScore === project.healthScore
  );
}

export async function validateWorkspaceCutoverState(
  dependencies: WorkspaceCutoverValidationDependencies = defaultWorkspaceCutoverValidationDependencies
): Promise<WorkspaceCutoverValidationResult> {
  const status = await getRequiredMigrationStatus(WORKSPACE_CUTOVER_MIGRATION_ID);
  if (status.state === "baseline") {
    return { ok: true, status, issues: [] };
  }
  if (status.state !== "success") {
    return {
      ok: false,
      status,
      issues: [
        {
          type: "required-migration",
          message:
            status.state === "failed"
              ? (status.record.error ?? "Required Workspace cutover migration failed")
              : "Required Workspace cutover migration has not run",
        },
      ],
    };
  }

  const issues: WorkspaceCutoverValidationIssue[] = [];
  let projects: LegacyProjectMeta[];
  try {
    projects = await dependencies.listLegacyProjects();
  } catch (error) {
    return {
      ok: false,
      status,
      issues: [
        {
          type: "required-migration",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const candidateCounts = new Map<string, number>();
  for (const project of projects) {
    const candidate = encodeProjectPath(project.path);
    candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
  }

  for (const project of projects) {
    try {
      const workspace = await dependencies.loadWorkspace(project.id);
      if (
        !workspace ||
        !matchesMigratedWorkspace(
          project,
          workspace,
          candidateCounts.get(encodeProjectPath(project.path)) ?? 0
        )
      ) {
        issues.push({
          type: "workspace-target",
          workspaceId: project.id,
          message: `Workspace target is missing or inconsistent: ${project.id}`,
        });
      }
    } catch (error) {
      issues.push({
        type: "workspace-target",
        workspaceId: project.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const folder = await dependencies.loadFolder(project.id);
      if (!folder || !matchesMigratedFolder(project, folder)) {
        issues.push({
          type: "folder-target",
          workspaceId: project.id,
          message: `Folder target is missing or inconsistent: ${project.id}`,
        });
      }
    } catch (error) {
      issues.push({
        type: "folder-target",
        workspaceId: project.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ok: issues.length === 0, status, issues };
}

export async function runMigrations(migrations: Migration[]): Promise<void> {
  const migrationsPath = getDataSubPath("migrations");

  const storeExists = await migrationStoreExists(migrationsPath);
  const store = await readMigrationStore(migrationsPath);

  if (!storeExists) {
    const projectsExists = await pathExists(getDataSubPath("projects"));
    const workspacesExists = await pathExists(getDataSubPath("workspaces"));
    const workspaceFoldersExists = await pathExists(getDataSubPath("workspace-folders"));
    const installedExists = await pathExists(join(getDataSubPath("acp"), "installed.json"));
    const isNewInstall =
      !projectsExists && !workspacesExists && !workspaceFoldersExists && !installedExists;

    if (isNewInstall) {
      // Fresh install: there is no legacy data to migrate, so baseline to the latest migration
      // and skip everything. This avoids running potentially expensive or destructive migrations
      // against an empty data directory.
      const lastMigration = migrations[migrations.length - 1];
      const newStore: MigrationStore = {
        executed: [],
        ...(lastMigration ? { baselineId: lastMigration.id } : {}),
      };
      await writeMigrationStore(migrationsPath, newStore);
      return;
    }
    // Existing install upgrading from a version before the migration store existed:
    // do not set a baseline so every migration gets a chance to run.
  }

  for (const migration of migrations) {
    if (shouldSkip(migration.id, store)) continue;

    const executedAt = new Date().toISOString();
    try {
      await migration.migrate({ version: app.getVersion() });
      store.executed.push({ id: migration.id, executedAt, status: "success" });
      logger.info(`[migrations] ${migration.id} ✓`);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      store.executed.push({ id: migration.id, executedAt, status: "failed", error });
      logger.error(`[migrations] ${migration.id} failed: ${error}`);
    }

    await writeMigrationStore(migrationsPath, store);
  }
}

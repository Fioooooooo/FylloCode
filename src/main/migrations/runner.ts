import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import logger from "@main/infra/logger";
import { WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID } from "@main/migrations/scripts/20260804_001_retire-legacy-project-storage";
import type { WorkspaceCutoverValidationIssue } from "./workspace-cutover-validation";
import { readMigrationStore, writeMigrationStore, migrationStoreExists } from "./store";
import type { Migration, MigrationRecord, MigrationStore } from "./types";
import { getDataSubPath } from "@main/infra/paths";

export type RequiredMigrationStatus =
  | { state: "success"; record: MigrationRecord }
  | { state: "failed"; record: MigrationRecord }
  | { state: "baseline"; baselineId: string }
  | { state: "pending"; baselineId?: string };

export type { WorkspaceCutoverValidationIssue } from "./workspace-cutover-validation";

export interface WorkspaceCutoverValidationResult {
  ok: boolean;
  status: RequiredMigrationStatus;
  issues: WorkspaceCutoverValidationIssue[];
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function shouldSkip(migration: Migration, store: MigrationStore): boolean {
  if (store.baselineId && migration.id <= store.baselineId) return true;
  const records = store.executed.filter((record) => record.id === migration.id);
  if (migration.retryPolicy === "until-success") {
    return records.some((record) => record.status === "success");
  }
  return records.length > 0;
}

export async function getRequiredMigrationStatus(id: string): Promise<RequiredMigrationStatus> {
  const store = await readMigrationStore(getDataSubPath("migrations"));
  const record = store.executed.findLast((candidate) => candidate.id === id);
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

export async function validateWorkspaceCutoverState(): Promise<WorkspaceCutoverValidationResult> {
  const status = await getRequiredMigrationStatus(WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID);
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

  return { ok: true, status, issues: [] };
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
    if (shouldSkip(migration, store)) continue;

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

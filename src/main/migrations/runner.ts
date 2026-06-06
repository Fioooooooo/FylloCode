import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import logger from "@main/infra/logger";
import { readMigrationStore, writeMigrationStore, migrationStoreExists } from "./store";
import type { Migration, MigrationStore } from "./types";
import { getDataSubPath } from "@main/infra/paths";

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

export async function runMigrations(migrations: Migration[]): Promise<void> {
  const migrationsPath = getDataSubPath("migrations");

  const storeExists = await migrationStoreExists(migrationsPath);
  const store = await readMigrationStore(migrationsPath);

  if (!storeExists) {
    const projectsExists = await pathExists(getDataSubPath("projects"));
    const installedExists = await pathExists(join(getDataSubPath("acp"), "installed.json"));
    const isNewInstall = !projectsExists && !installedExists;

    if (isNewInstall) {
      const lastMigration = migrations[migrations.length - 1];
      const newStore: MigrationStore = {
        executed: [],
        ...(lastMigration ? { baselineId: lastMigration.id } : {}),
      };
      await writeMigrationStore(migrationsPath, newStore);
      return;
    }
    // 老用户升级：不设 baselineId，继续执行所有迁移
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

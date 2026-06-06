import { promises as fs } from "fs";
import { join } from "path";
import type { MigrationStore } from "./types";

function emptyStore(): MigrationStore {
  return { executed: [] };
}

function getMigrationsFilePath(migrationsPath: string): string {
  return join(migrationsPath, "migrations.json");
}

export async function readMigrationStore(migrationsPath: string): Promise<MigrationStore> {
  try {
    const content = await fs.readFile(getMigrationsFilePath(migrationsPath), "utf8");
    return JSON.parse(content) as MigrationStore;
  } catch {
    return emptyStore();
  }
}

export async function writeMigrationStore(
  migrationsPath: string,
  store: MigrationStore
): Promise<void> {
  await fs.mkdir(migrationsPath, { recursive: true });
  await fs.writeFile(getMigrationsFilePath(migrationsPath), JSON.stringify(store, null, 2), "utf8");
}

export async function migrationStoreExists(migrationsPath: string): Promise<boolean> {
  try {
    await fs.access(getMigrationsFilePath(migrationsPath));
    return true;
  } catch {
    return false;
  }
}

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrationContext, MigrationStore } from "@main/migrations/types";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-migrations-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => join(tempRoot, "userData", subPath)),
}));

import {
  getRequiredMigrationStatus,
  runMigrations,
  validateWorkspaceCutoverState,
} from "@main/migrations/runner";
import { WORKSPACE_CUTOVER_MIGRATION_ID } from "@main/migrations/scripts/20260802_001_project-to-workspace";

function migrationsPath(): string {
  return join(tempRoot, "userData", "migrations");
}

function readStore(): MigrationStore {
  return JSON.parse(
    readFileSync(join(migrationsPath(), "migrations.json"), "utf8")
  ) as MigrationStore;
}

function writeStore(store: MigrationStore): void {
  mkdirSync(migrationsPath(), { recursive: true });
  writeFileSync(join(migrationsPath(), "migrations.json"), JSON.stringify(store), "utf8");
}

function makeMigration(id: string, fn?: (ctx: MigrationContext) => Promise<void>) {
  return { id, migrate: fn ?? vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("runMigrations", () => {
  describe("new install (no existing data)", () => {
    it("writes baselineId and does not execute any migrations", async () => {
      const m1 = makeMigration("20260601_001_foo");
      const m2 = makeMigration("20260601_002_bar");

      await runMigrations([m1, m2]);

      expect(m1.migrate).not.toHaveBeenCalled();
      expect(m2.migrate).not.toHaveBeenCalled();

      const store = readStore();
      expect(store.baselineId).toBe("20260601_002_bar");
      expect(store.executed).toEqual([]);
    });

    it("writes empty store with no baselineId when migration list is empty", async () => {
      await runMigrations([]);

      const store = readStore();
      expect(store.baselineId).toBeUndefined();
      expect(store.executed).toEqual([]);
    });
  });

  describe("existing user upgrade (data/projects exists)", () => {
    it("executes all migrations without setting baselineId", async () => {
      mkdirSync(join(tempRoot, "userData", "projects"), { recursive: true });
      const m1 = makeMigration("20260601_001_foo");
      const m2 = makeMigration("20260601_002_bar");

      await runMigrations([m1, m2]);

      expect(m1.migrate).toHaveBeenCalledOnce();
      expect(m2.migrate).toHaveBeenCalledOnce();

      const store = readStore();
      expect(store.baselineId).toBeUndefined();
      expect(store.executed).toHaveLength(2);
      expect(store.executed[0].status).toBe("success");
      expect(store.executed[1].status).toBe("success");
    });

    it.each(["workspaces", "workspace-folders"])(
      "does not baseline when the %s marker exists",
      async (marker) => {
        mkdirSync(join(tempRoot, "userData", marker), { recursive: true });
        const migration = makeMigration("20260601_001_foo");

        await runMigrations([migration]);

        expect(migration.migrate).toHaveBeenCalledOnce();
        expect(readStore().baselineId).toBeUndefined();
      }
    );

    it("existing user detected via acp/installed.json", async () => {
      mkdirSync(join(tempRoot, "userData", "acp"), { recursive: true });
      writeFileSync(join(tempRoot, "userData", "acp", "installed.json"), "{}", "utf8");

      const m1 = makeMigration("20260601_001_foo");
      await runMigrations([m1]);

      expect(m1.migrate).toHaveBeenCalledOnce();
      const store = readStore();
      expect(store.baselineId).toBeUndefined();
    });
  });

  describe("baseline skipping", () => {
    it("skips migrations with id <= baselineId", async () => {
      mkdirSync(migrationsPath(), { recursive: true });
      writeFileSync(
        join(migrationsPath(), "migrations.json"),
        JSON.stringify({ baselineId: "20260601_002_bar", executed: [] }),
        "utf8"
      );

      const m1 = makeMigration("20260601_001_foo");
      const m2 = makeMigration("20260601_002_bar");
      const m3 = makeMigration("20260601_003_baz");

      await runMigrations([m1, m2, m3]);

      expect(m1.migrate).not.toHaveBeenCalled();
      expect(m2.migrate).not.toHaveBeenCalled();
      expect(m3.migrate).toHaveBeenCalledOnce();
    });
  });

  describe("already executed migrations", () => {
    it("skips migrations already recorded as success", async () => {
      mkdirSync(migrationsPath(), { recursive: true });
      writeFileSync(
        join(migrationsPath(), "migrations.json"),
        JSON.stringify({
          executed: [
            { id: "20260601_001_foo", executedAt: "2026-06-01T00:00:00.000Z", status: "success" },
          ],
        }),
        "utf8"
      );

      const m1 = makeMigration("20260601_001_foo");
      const m2 = makeMigration("20260601_002_bar");

      await runMigrations([m1, m2]);

      expect(m1.migrate).not.toHaveBeenCalled();
      expect(m2.migrate).toHaveBeenCalledOnce();
    });
  });

  describe("failure handling", () => {
    it("records failed migration and continues executing subsequent ones", async () => {
      mkdirSync(join(tempRoot, "userData", "projects"), { recursive: true });
      const m1 = makeMigration("20260601_001_foo", vi.fn().mockRejectedValue(new Error("boom")));
      const m2 = makeMigration("20260601_002_bar");

      await runMigrations([m1, m2]);

      expect(m1.migrate).toHaveBeenCalledOnce();
      expect(m2.migrate).toHaveBeenCalledOnce();

      const store = readStore();
      expect(store.executed[0].status).toBe("failed");
      expect(store.executed[0].error).toBe("boom");
      expect(store.executed[1].status).toBe("success");
    });

    it("does not retry failed migrations on subsequent runs", async () => {
      mkdirSync(join(tempRoot, "userData", "projects"), { recursive: true });
      const m1 = makeMigration("20260601_001_foo", vi.fn().mockRejectedValue(new Error("boom")));

      await runMigrations([m1]);
      await runMigrations([m1]);

      expect(m1.migrate).toHaveBeenCalledOnce();
    });

    it("does not throw even if all migrations fail", async () => {
      mkdirSync(join(tempRoot, "userData", "projects"), { recursive: true });
      const m1 = makeMigration("20260601_001_foo", vi.fn().mockRejectedValue(new Error("x")));

      await expect(runMigrations([m1])).resolves.toBeUndefined();
    });
  });
});

describe("required migration gate", () => {
  const executedAt = "2026-08-02T00:00:00.000Z";
  const legacyProject: LegacyProjectMeta = {
    id: "workspace-1",
    name: "Workspace One",
    path: "/repositories/workspace-one",
    healthScore: 92,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
  };
  const workspace: WorkspaceMeta = {
    version: 2,
    id: legacyProject.id,
    name: legacyProject.name,
    kind: "folder",
    isDeleted: false,
    legacyAppDataKey: "repositories-workspace-one",
    folderIds: [legacyProject.id],
    primaryFolderId: legacyProject.id,
    createdAt: legacyProject.createdAt,
    lastOpenedAt: legacyProject.lastOpenedAt,
  };
  const folder: FolderMeta = {
    version: 1,
    id: legacyProject.id,
    name: legacyProject.name,
    path: legacyProject.path,
    healthScore: legacyProject.healthScore,
  };

  it("reports success and failed ledger records", async () => {
    writeStore({
      baselineId: "99999999_999_future",
      executed: [
        {
          id: WORKSPACE_CUTOVER_MIGRATION_ID,
          executedAt,
          status: "failed",
          error: "copy failed",
        },
      ],
    });

    await expect(getRequiredMigrationStatus(WORKSPACE_CUTOVER_MIGRATION_ID)).resolves.toMatchObject(
      {
        state: "failed",
        record: { error: "copy failed" },
      }
    );

    writeStore({
      executed: [{ id: WORKSPACE_CUTOVER_MIGRATION_ID, executedAt, status: "success" }],
    });
    await expect(getRequiredMigrationStatus(WORKSPACE_CUTOVER_MIGRATION_ID)).resolves.toMatchObject(
      {
        state: "success",
      }
    );
  });

  it("uses baseline only when no executed record covers the required ID", async () => {
    writeStore({ baselineId: WORKSPACE_CUTOVER_MIGRATION_ID, executed: [] });
    await expect(getRequiredMigrationStatus(WORKSPACE_CUTOVER_MIGRATION_ID)).resolves.toEqual({
      state: "baseline",
      baselineId: WORKSPACE_CUTOVER_MIGRATION_ID,
    });

    writeStore({ baselineId: "20260101_001_older", executed: [] });
    await expect(getRequiredMigrationStatus(WORKSPACE_CUTOVER_MIGRATION_ID)).resolves.toEqual({
      state: "pending",
      baselineId: "20260101_001_older",
    });
  });

  it("accepts a fresh-install baseline without requiring target metadata", async () => {
    writeStore({ baselineId: WORKSPACE_CUTOVER_MIGRATION_ID, executed: [] });
    const dependencies = {
      listLegacyProjects: vi.fn(),
      loadWorkspace: vi.fn(),
      loadFolder: vi.fn(),
    };

    await expect(validateWorkspaceCutoverState(dependencies)).resolves.toMatchObject({
      ok: true,
      status: { state: "baseline" },
      issues: [],
    });
    expect(dependencies.listLegacyProjects).not.toHaveBeenCalled();
  });

  it("rejects a success ledger record when a target is incomplete", async () => {
    writeStore({
      executed: [{ id: WORKSPACE_CUTOVER_MIGRATION_ID, executedAt, status: "success" }],
    });

    await expect(
      validateWorkspaceCutoverState({
        listLegacyProjects: async () => [legacyProject],
        loadWorkspace: async () => workspace,
        loadFolder: async () => null,
      })
    ).resolves.toMatchObject({
      ok: false,
      status: { state: "success" },
      issues: [
        {
          type: "folder-target",
          workspaceId: legacyProject.id,
        },
      ],
    });
  });

  it("accepts a success ledger record with complete Workspace and Folder targets", async () => {
    writeStore({
      executed: [{ id: WORKSPACE_CUTOVER_MIGRATION_ID, executedAt, status: "success" }],
    });

    await expect(
      validateWorkspaceCutoverState({
        listLegacyProjects: async () => [legacyProject],
        loadWorkspace: async () => workspace,
        loadFolder: async () => folder,
      })
    ).resolves.toMatchObject({ ok: true, status: { state: "success" }, issues: [] });
  });
});

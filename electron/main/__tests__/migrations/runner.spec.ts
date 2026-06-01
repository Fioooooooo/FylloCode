import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrationContext, MigrationStore } from "@main/migrations/types";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@main/__tests__/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-migrations-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => join(tempRoot, "userData", subPath)),
}));

import { runMigrations } from "@main/migrations/runner";

function migrationsPath(): string {
  return join(tempRoot, "userData", "migrations");
}

function readStore(): MigrationStore {
  return JSON.parse(
    readFileSync(join(migrationsPath(), "migrations.json"), "utf8")
  ) as MigrationStore;
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

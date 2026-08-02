import { readdirSync } from "fs";
import { join, parse } from "path";
import { describe, expect, it } from "vitest";
import { migrations } from "@main/migrations/scripts";
import { WORKSPACE_CUTOVER_MIGRATION_ID } from "@main/migrations";
import { CORTEX_WORKSPACE_SCOPE_MIGRATION_ID } from "@main/migrations/scripts/20260803_001_cortex-workspace-scope";
import { WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID } from "@main/migrations/scripts/20260804_001_retire-legacy-project-storage";

const migrationFilePattern = /^\d{8}_\d{3}_.+\.ts$/;

function getExpectedMigrationIds(): string[] {
  const scriptsDir = join(process.cwd(), "src", "main", "migrations", "scripts");
  return readdirSync(scriptsDir)
    .filter((file) => migrationFilePattern.test(file))
    .sort()
    .map((file) => parse(file).name);
}

describe("migration scripts registry", () => {
  it("exports migrations in script filename order", () => {
    expect(migrations.map((migration) => migration.id)).toEqual(getExpectedMigrationIds());
  });

  it("keeps the immutable Workspace cutover ID and appends later migrations", () => {
    expect(WORKSPACE_CUTOVER_MIGRATION_ID).toBe("20260802_001_project-to-workspace");
    expect(CORTEX_WORKSPACE_SCOPE_MIGRATION_ID).toBe("20260803_001_cortex-workspace-scope");
    expect(WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID).toBe(
      "20260804_001_retire-legacy-project-storage"
    );
    expect(migrations.at(-1)).toMatchObject({
      id: WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID,
      retryPolicy: "until-success",
    });
    expect(
      migrations.findIndex((migration) => migration.id === WORKSPACE_CUTOVER_MIGRATION_ID)
    ).toBeLessThan(
      migrations.findIndex((migration) => migration.id === CORTEX_WORKSPACE_SCOPE_MIGRATION_ID)
    );
    expect(
      migrations.filter((migration) => migration.id === WORKSPACE_CUTOVER_MIGRATION_ID)
    ).toHaveLength(1);
    expect(
      migrations.findIndex((migration) => migration.id === CORTEX_WORKSPACE_SCOPE_MIGRATION_ID)
    ).toBeLessThan(
      migrations.findIndex(
        (migration) => migration.id === WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID
      )
    );
    expect(
      migrations.filter((migration) => migration.id === WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID)
    ).toHaveLength(1);
  });
});

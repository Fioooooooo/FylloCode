import { readdirSync } from "fs";
import { join, parse } from "path";
import { describe, expect, it } from "vitest";
import { migrations } from "@main/migrations/scripts";

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
});

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("Workspace storage inventory", () => {
  it("does not derive normal storage identity from a repository path", () => {
    const storageRoot = join(process.cwd(), "src/main/infra/storage");
    const violations = sourceFiles(storageRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return /projectDir\(|encodeProjectPath\(|\bprojectPath\b/.test(source) ? [filePath] : [];
    });

    expect(violations).toEqual([]);
  });
});

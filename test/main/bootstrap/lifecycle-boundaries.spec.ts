import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const MAIN_ROOT = join(process.cwd(), "src/main");

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listTypeScriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
  );
  return nested.flat();
}

describe("main lifecycle architecture boundaries", () => {
  it("keeps global lifecycle ordering in bootstrap and forbids deep registration", async () => {
    const files = await listTypeScriptFiles(MAIN_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      const source = await fs.readFile(file, "utf8");
      const path = relative(process.cwd(), file);
      if (/registerDisposable|disposeAll/.test(source)) violations.push(path);
      if (
        !path.startsWith("src/main/bootstrap/") &&
        /SHUTDOWN_PHASES|runLifecyclePhases\s*\(/.test(source)
      ) {
        violations.push(path);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the startup entry free of a static runtime import", async () => {
    const source = await fs.readFile(join(MAIN_ROOT, "bootstrap/index.ts"), "utf8");
    expect(source).not.toMatch(/^import .*from ["']\.\/runtime["'];?$/m);
    expect(source).toContain('await import("./runtime")');
  });
});

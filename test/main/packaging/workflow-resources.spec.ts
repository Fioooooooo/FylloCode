import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow package resources", () => {
  it("does not package the removed built-in workflow template tree", async () => {
    const resourcesRoot = join(process.cwd(), "resources");
    let entries: string[] = [];
    try {
      entries = await readdir(resourcesRoot, { recursive: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    expect(entries.filter((entry) => entry.startsWith("workflows/built-in/"))).toEqual([]);
    const builderConfig = await readFile(join(process.cwd(), "electron-builder.yml"), "utf8");
    expect(builderConfig).not.toContain("resources/workflows/built-in");
  });
});

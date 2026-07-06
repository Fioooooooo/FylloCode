import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGuidelinesBrowser } from "@main/services/guidelines/guidelines-browser-service";

let projectPath: string;

async function writeGuideline(
  relativePath: string,
  content: string,
  updatedAt: Date
): Promise<void> {
  const absolutePath = join(projectPath, relativePath);
  await fs.mkdir(join(absolutePath, ".."), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  await fs.utimes(absolutePath, updatedAt, updatedAt);
}

describe("guidelines-browser-service", () => {
  beforeEach(async () => {
    projectPath = await fs.mkdtemp(join(tmpdir(), "fyllocode-guidelines-browser-"));
  });

  afterEach(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it("recursively returns sorted guideline metadata, updatedAt, and markdown content", async () => {
    const architectureUpdatedAt = new Date("2026-06-20T10:00:00.000Z");
    const routingUpdatedAt = new Date("2026-06-21T11:00:00.000Z");

    await writeGuideline(
      "guidelines/frontend/Routing.md",
      [
        "---",
        'name: "Routing"',
        'description: "Renderer routes"',
        'keywords: ["frontend", "routing"]',
        "---",
        "# Routing",
        "",
        "Renderer pages live under `src/renderer/src/pages`.",
      ].join("\n"),
      routingUpdatedAt
    );
    await writeGuideline(
      "guidelines/Architecture.md",
      [
        "---",
        'name: "Architecture"',
        'description: "Top-level boundaries"',
        'keywords: ["architecture"]',
        "---",
        "# Architecture",
        "",
        "Keep process boundaries explicit.",
      ].join("\n"),
      architectureUpdatedAt
    );
    await writeGuideline(
      "guidelines/draft.txt",
      "not markdown",
      new Date("2026-06-22T12:00:00.000Z")
    );

    const result = await getGuidelinesBrowser(projectPath);

    expect(result.items.map((item) => item.path)).toEqual([
      "guidelines/Architecture.md",
      "guidelines/frontend/Routing.md",
    ]);
    expect(result.items[0]).toMatchObject({
      name: "Architecture",
      description: "Top-level boundaries",
      keywords: ["architecture"],
      updatedAt: architectureUpdatedAt.toISOString(),
      content: "# Architecture\n\nKeep process boundaries explicit.",
    });
    expect(result.items[0]?.content).not.toContain("name:");
    expect(result.items[1]).toMatchObject({
      name: "Routing",
      description: "Renderer routes",
      keywords: ["frontend", "routing"],
      updatedAt: routingUpdatedAt.toISOString(),
    });
  });

  it("keeps guidelines with invalid frontmatter and surfaces parse error", async () => {
    await writeGuideline(
      "guidelines/Bad.md",
      ["---", ": : :", "---", "# Bad", "", "Still readable."].join("\n"),
      new Date("2026-06-23T12:00:00.000Z")
    );

    const result = await getGuidelinesBrowser(projectPath);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      path: "guidelines/Bad.md",
      name: "Bad",
      description: null,
      keywords: null,
      content: "# Bad\n\nStill readable.",
      parseError: expect.any(String),
    });
    expect(result.items[0]?.parseError).not.toBe("");
  });

  it("returns an empty list when guidelines directory is missing", async () => {
    await expect(getGuidelinesBrowser(projectPath)).resolves.toEqual({ items: [] });
  });
});

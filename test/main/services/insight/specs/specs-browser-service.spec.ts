import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSpecsBrowser } from "@main/services/insight/specs/specs-browser-service";

let projectPath: string;

async function writeSpec(id: string, content: string, updatedAt: Date): Promise<void> {
  const specDir = join(projectPath, "openspec", "specs", id);
  const specPath = join(specDir, "spec.md");
  await fs.mkdir(specDir, { recursive: true });
  await fs.writeFile(specPath, content, "utf8");
  await fs.utimes(specPath, updatedAt, updatedAt);
}

describe("specs-browser-service", () => {
  beforeEach(async () => {
    projectPath = await fs.mkdtemp(join(tmpdir(), "fyllocode-specs-browser-"));
  });

  afterEach(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it("returns specs sorted by capability id with parsed counts and updatedAt", async () => {
    const alphaUpdatedAt = new Date("2026-06-20T10:00:00.000Z");
    const betaUpdatedAt = new Date("2026-06-21T11:00:00.000Z");

    await writeSpec(
      "beta-capability",
      [
        "# Beta",
        "## Purpose",
        "定义 Beta 能力。",
        "## Requirements",
        "### Requirement: Beta requirement",
        "系统 SHALL 支持 Beta。",
        "#### Scenario: Beta scenario",
        "- **WHEN** 用户查看 Beta",
        "- **THEN** 返回 Beta 内容",
      ].join("\n"),
      betaUpdatedAt
    );
    await writeSpec(
      "alpha-capability",
      [
        "# Alpha",
        "## Purpose",
        "定义 Alpha 能力。",
        "## Requirements",
        "### Requirement: Alpha requirement",
        "系统 SHALL 支持 Alpha。",
      ].join("\n"),
      alphaUpdatedAt
    );

    const result = await getSpecsBrowser(projectPath);

    expect(result.items.map((item) => item.id)).toEqual(["alpha-capability", "beta-capability"]);
    expect(result.items[0]).toMatchObject({
      id: "alpha-capability",
      purpose: "定义 Alpha 能力。",
      sourcePath: "openspec/specs/alpha-capability/spec.md",
      requirementsCount: 1,
      scenariosCount: 0,
    });
    expect(result.items[0].updatedAt).toBe(alphaUpdatedAt.toISOString());
    expect(result.items[1]).toMatchObject({
      id: "beta-capability",
      requirementsCount: 1,
      scenariosCount: 1,
    });
    expect(result.items[1].updatedAt).toBe(betaUpdatedAt.toISOString());
  });

  it("returns an empty list when openspec specs directory is missing", async () => {
    await expect(getSpecsBrowser(projectPath)).resolves.toEqual({ items: [] });
  });

  it("skips capability directories without a readable spec.md", async () => {
    await fs.mkdir(join(projectPath, "openspec", "specs", "missing-spec"), { recursive: true });
    await writeSpec(
      "available-spec",
      "# Available\n## Purpose\n可读能力规约。",
      new Date("2026-06-22T12:00:00.000Z")
    );

    const result = await getSpecsBrowser(projectPath);

    expect(result.items.map((item) => item.id)).toEqual(["available-spec"]);
  });
});

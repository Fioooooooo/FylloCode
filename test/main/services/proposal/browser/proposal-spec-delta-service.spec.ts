import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getProposalSpecDeltas } from "@main/services/proposal/browser/proposal-spec-delta-service";

let tempProjectPath: string;

async function writeFile(path: string, content: string): Promise<void> {
  await fs.mkdir(join(path, ".."), { recursive: true });
  await fs.writeFile(path, content, "utf8");
}

async function createChange(changeId: string, content?: string): Promise<string> {
  const changeDir = join(tempProjectPath, "openspec", "changes", changeId);
  await fs.mkdir(changeDir, { recursive: true });
  await fs.writeFile(join(changeDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
  if (content) {
    await writeFile(join(changeDir, "specs", "proposal-detail", "spec.md"), content);
  }
  return changeDir;
}

function deltaSpecContent(): string {
  return [
    "# proposal-detail",
    "",
    "## Purpose",
    "",
    "Show proposal detail delta.",
    "",
    "## Requirements",
    "",
    "### Requirement: Ignored complete requirement",
    "",
    "This is not under a delta section.",
    "",
    "## ADDED Requirements",
    "",
    "### Requirement: Show Specs tab",
    "",
    "The detail SHALL show specs delta.",
    "",
    "#### Scenario: Added scenario",
    "",
    "- **WHEN** specs exist",
    "- **THEN** show the tab",
    "",
    "## MODIFIED Requirements",
    "",
    "### Requirement: Open as Slideover",
    "",
    "The detail SHALL not navigate.",
    "",
    "#### Scenario: Modified scenario",
    "",
    "- **WHEN** opened",
    "- **THEN** stay on route",
    "",
    "## REMOVED Requirements",
    "",
    "### Requirement: Detail route",
    "",
    "**Reason**: Details are no longer route-owned.",
    "**Migration**: Use programmatic overlay.",
    "",
    "## RENAMED Requirements",
    "",
    "### Requirement: Legacy name",
    "",
    "The requirement was renamed.",
  ].join("\n");
}

describe("proposal spec delta service", () => {
  beforeEach(async () => {
    tempProjectPath = await fs.mkdtemp(join(tmpdir(), "fyllocode-proposal-spec-delta-"));
  });

  afterEach(async () => {
    await fs.rm(tempProjectPath, { recursive: true, force: true });
  });

  it("parses ADDED, MODIFIED, REMOVED and RENAMED requirement deltas", async () => {
    await createChange("change-1", deltaSpecContent());

    const result = await getProposalSpecDeltas(tempProjectPath, "change-1");

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "proposal-detail",
      purpose: "Show proposal detail delta.",
      sourcePath: "specs/proposal-detail/spec.md",
      deltaTypes: ["ADDED", "MODIFIED", "REMOVED", "RENAMED"],
      requirementsCount: 4,
      scenariosCount: 2,
    });
    expect(result.items[0].requirementGroups.map((group) => group.deltaType)).toEqual([
      "ADDED",
      "MODIFIED",
      "REMOVED",
      "RENAMED",
    ]);
    expect(result.items[0].requirementGroups[2]).toMatchObject({
      deltaType: "REMOVED",
      title: "Detail route",
      scenarios: [],
    });
    expect(result.items[0].requirementGroups[2].body).toContain("Reason");
    expect(result.items[0].requirementGroups[3]).toMatchObject({
      deltaType: "RENAMED",
      title: "Legacy name",
      scenarios: [],
    });
  });

  it("returns an empty overview when specs directory is absent", async () => {
    await createChange("without-specs");

    await expect(getProposalSpecDeltas(tempProjectPath, "without-specs")).resolves.toEqual({
      items: [],
    });
  });

  it("skips capability directories that do not contain spec.md", async () => {
    const changeDir = await createChange("partial-specs");
    await fs.mkdir(join(changeDir, "specs", "missing-spec"), { recursive: true });
    await writeFile(join(changeDir, "specs", "proposal-ipc", "spec.md"), deltaSpecContent());

    const result = await getProposalSpecDeltas(tempProjectPath, "partial-specs");

    expect(result.items.map((item) => item.id)).toEqual(["proposal-ipc"]);
  });

  it("locates archived proposal ids", async () => {
    const archiveDir = join(
      tempProjectPath,
      "openspec",
      "changes",
      "archive",
      "2026-06-22-change-1"
    );
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(join(archiveDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(archiveDir, "specs", "proposal-detail", "spec.md"), deltaSpecContent());

    const result = await getProposalSpecDeltas(tempProjectPath, "2026-06-22-change-1");

    expect(result.items[0]?.id).toBe("proposal-detail");
  });
});

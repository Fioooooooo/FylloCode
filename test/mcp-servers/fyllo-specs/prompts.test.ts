import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const promptDir = join(
  process.cwd(),
  "src",
  "mcp-servers",
  "fyllo-specs",
  "src",
  "tools",
  "instructions"
);
const promptFiles = ["explore.md", "create-proposal.md", "apply-change.md", "archive-change.md"];

describe("fyllo-specs prompts", () => {
  for (const file of promptFiles) {
    it(`${file} is non-empty and hides direct openspec CLI`, () => {
      const text = readFileSync(join(promptDir, file), "utf8");
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(
        /openspec list --json|openspec status|openspec instructions|openspec new change/
      );
    });
  }

  it("create-proposal prompt ends with an explicit draft write-back", () => {
    const text = readFileSync(join(promptDir, "create-proposal.md"), "utf8");
    expect(text).toMatch(/status:\s*draft/);
    expect(text).toMatch(/all required artifacts are complete/i);
  });

  it("explore prompt is read-only and does not mutate proposal status", () => {
    const text = readFileSync(join(promptDir, "explore.md"), "utf8");
    expect(text).toMatch(/read-only/i);
    expect(text).toMatch(/must not mutate proposal status/i);
  });
});

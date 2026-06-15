import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadPrompt } from "../../../src/mcp-servers/fyllo-cortex/src/utils/load-prompt";

const promptPath = join(
  process.cwd(),
  "src",
  "mcp-servers",
  "fyllo-cortex",
  "src",
  "tools",
  "instructions",
  "guidelines.md"
);

describe("fyllo-cortex prompts", () => {
  it("keeps guidelines.md on disk", () => {
    expect(existsSync(promptPath)).toBe(true);
    expect(readFileSync(promptPath, "utf8").trim()).toBeTruthy();
  });

  it("keeps the guidelines instruction concrete enough for repository authoring", () => {
    const text = loadPrompt("guidelines");

    expect(text).toContain("## AGENTS.md Guidelines Index");
    expect(text).toContain("## Project Guidelines Index");
    expect(text).toContain("Do not generate or replace a full `AGENTS.md` document");
    expect(text).toContain("Root `AGENTS.md`");
    expect(text).toContain("## Recommended Guideline Files");
    expect(text).toContain("## Guideline Document Format");
    expect(text).toContain("## Topic-Specific Content Requirements");
    expect(text).toContain("guidelines/Architecture.md");
    expect(text).toContain("guidelines/CodeStyle.md");
    expect(text).toContain("guidelines/Testing.md");
    expect(text).toContain("guidelines/DataModel.md");
    expect(text).toContain("guidelines/API.md");
    expect(text).toContain("guidelines/IPC.md");
    expect(text).toContain("guidelines/Backend.md");
    expect(text).toContain("guidelines/Frontend.md");
    expect(text).toContain("guidelines/DeveloperWorkflow.md");
    expect(text).toContain("Sources of Truth");
    expect(text).toContain("Verification");
    expect(text).toContain("Frontmatter");
    expect(text).toContain("name");
    expect(text).toContain("description");
    expect(text).toContain("keywords");
    expect(text).not.toContain("## Project Overview");
    expect(text).not.toContain("## Tech Stack");
    expect(text).not.toContain("## Repository Layout");
    expect(text).not.toContain("Chat");
    expect(text).not.toContain("Proposal");
    expect(text).not.toContain("Apply");
    expect(text).not.toContain("Archive");
    expect(text).not.toContain("OpenSpec");
    expect(text).not.toContain("worktree");
    expect(text).not.toContain("commit");
    expect(text).not.toContain("如需更多详细信息");
    expect(text).not.toContain("nested `AGENTS.md`");
  });
});

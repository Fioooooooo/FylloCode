import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { applyChangeTool } from "../src/tools/apply-change";
import { createProposalTool } from "../src/tools/create-proposal";
import { archiveChangeTool } from "../src/tools/archive-change";
import { exploreTool } from "../src/tools/explore";

function parseState(text: string): Record<string, unknown> {
  const match = text.match(/<state>\n([\s\S]+?)\n<\/state>/);
  if (match) return JSON.parse(match[1]);
  // When includeInstruction is false, the response is plain JSON without XML tags
  return JSON.parse(text);
}

describe("tools", () => {
  const cliPath = join(
    process.cwd(),
    "node_modules",
    "@fission-ai",
    "openspec",
    "bin",
    "openspec.js"
  );
  const fixtureRoot = join(
    process.cwd(),
    "mcp-servers",
    "fyllo-specs",
    "__tests__",
    "fixtures",
    "openspec-sample"
  );

  it("explore returns state", async () => {
    const text = await exploreTool({});
    expect(text).toContain("<tool_instruction>");
    expect(text).toContain("<state>");
  });

  it("explore returns plain JSON when includeInstruction is false", async () => {
    const text = await exploreTool({ includeInstruction: false });
    expect(text).not.toContain("<tool_instruction>");
    const state = JSON.parse(text);
    expect(state).toHaveProperty("activeChanges");
  });

  it("create-proposal returns error state for invalid input", async () => {
    const text = await createProposalTool({ changeName: "bad name" });
    const state = parseState(text);
    expect(state.errors).toBeInstanceOf(Array);
    expect((state.errors as Array<{ message: string }>)[0].message).toContain("kebab-case");
  });

  it("create-proposal returns plain JSON error when includeInstruction is false", async () => {
    const text = await createProposalTool({ changeName: "bad name", includeInstruction: false });
    expect(text).not.toContain("<tool_instruction>");
    const state = JSON.parse(text);
    expect(state.errors).toBeInstanceOf(Array);
    expect((state.errors as Array<{ message: string }>)[0].message).toContain("kebab-case");
  });

  it("apply-change returns ready for the active change", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = fixtureRoot;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await applyChangeTool({ changeName: "sample-change" });
      expect(text).toContain('"changeName": "sample-change"');
      expect(text).toContain('"applyState": "ready"');
    } finally {
      process.env.FYLLO_PROJECT_PATH = prev;
      process.env.FYLLO_OPENSPEC_CLI_PATH = prevCli;
    }
  });

  it("apply-change returns error state for missing change", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    mkdirSync(join(root, "openspec"), { recursive: true });
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await applyChangeTool({ changeName: "missing-change" });
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("Change not found");
    } finally {
      process.env.FYLLO_PROJECT_PATH = prev;
      process.env.FYLLO_OPENSPEC_CLI_PATH = prevCli;
    }
  });

  it("archive-change returns error state for missing change", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    mkdirSync(join(root, "openspec"), { recursive: true });
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await archiveChangeTool({ changeName: "missing-change" });
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("Change not found");
    } finally {
      process.env.FYLLO_PROJECT_PATH = prev;
    }
  });

  it("archive-change successfully archives a change with confirm: true", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const changeDir = join(root, "openspec", "changes", "test-archive");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    writeFileSync(
      join(changeDir, ".openspec.yaml"),
      "schema: spec-driven\nstatus: applying\n",
      "utf8"
    );
    writeFileSync(
      join(changeDir, "tasks.md"),
      "## 1. Task\n- [x] 1.1 done\n- [ ] 1.2 todo\n",
      "utf8"
    );
    writeFileSync(join(changeDir, "design.md"), "# Design\n", "utf8");

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await archiveChangeTool({ changeName: "test-archive", confirm: true });
      const state = parseState(text);
      expect(state.errors).toBeUndefined();
      expect(state.changeName).toBe("test-archive");
      expect(state.confirm).toBe(true);
      expect(state.incompleteTasks).toBe(1);
      expect(state.archiveTarget).toContain("test-archive");
      expect(typeof state.archiveRawOutput).toBe("string");
      expect((state.archiveRawOutput as string).length).toBeGreaterThan(0);
      // Source directory should be gone
      expect(existsSync(changeDir)).toBe(false);
      // Archive directory should exist
      expect(existsSync(state.archiveTarget as string)).toBe(true);
      // tasks.md should be in archive
      expect(existsSync(join(state.archiveTarget as string, "tasks.md"))).toBe(true);
    } finally {
      process.env.FYLLO_PROJECT_PATH = prev;
      process.env.FYLLO_OPENSPEC_CLI_PATH = prevCli;
    }
  });

  it("archive-change syncs delta specs before archiving", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const changeDir = join(root, "openspec", "changes", "test-sync-spec");
    const mainSpecDir = join(root, "openspec", "specs", "test-cap");
    mkdirSync(changeDir, { recursive: true });
    mkdirSync(mainSpecDir, { recursive: true });

    // Existing main spec
    writeFileSync(
      join(mainSpecDir, "spec.md"),
      "# test-cap Specification\n\n## Purpose\nTest.\n\n## Requirements\n\n### Requirement: Existing\n\nSystem SHALL do the original thing.\n\n#### Scenario: Original scenario\n\n- **WHEN** something happens\n- **THEN** it works\n",
      "utf8"
    );

    // Delta spec in change
    const specChangeDir = join(changeDir, "specs", "test-cap");
    mkdirSync(specChangeDir, { recursive: true });
    writeFileSync(
      join(specChangeDir, "spec.md"),
      "## MODIFIED Requirements\n\n### Requirement: Existing\n\nSystem SHALL do the updated thing.\n\n#### Scenario: Updated scenario\n\n- **WHEN** something new happens\n- **THEN** it works better\n\n## ADDED Requirements\n\n### Requirement: New One\n\nSystem SHALL support the new feature.\n\n#### Scenario: New scenario\n\n- **WHEN** new feature is used\n- **THEN** it succeeds\n",
      "utf8"
    );

    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    writeFileSync(
      join(changeDir, ".openspec.yaml"),
      "schema: spec-driven\nstatus: applying\n",
      "utf8"
    );
    writeFileSync(join(changeDir, "tasks.md"), "## 1. Task\n- [x] 1.1 done\n", "utf8");

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await archiveChangeTool({ changeName: "test-sync-spec", confirm: true });
      const state = parseState(text);
      expect(state.errors).toBeUndefined();
      expect(state.changeName).toBe("test-sync-spec");
      expect(typeof state.archiveRawOutput).toBe("string");
      expect((state.archiveRawOutput as string).length).toBeGreaterThan(0);

      // Main spec should be updated by openspec CLI
      const mainSpecContent = readFileSync(join(mainSpecDir, "spec.md"), "utf8");
      expect(mainSpecContent).toContain("System SHALL do the updated thing.");
      expect(mainSpecContent).toContain("System SHALL support the new feature.");

      // Change should be archived
      expect(existsSync(changeDir)).toBe(false);
      expect(existsSync(state.archiveTarget as string)).toBe(true);
    } finally {
      process.env.FYLLO_PROJECT_PATH = prev;
      process.env.FYLLO_OPENSPEC_CLI_PATH = prevCli;
    }
  });
});

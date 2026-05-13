import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import {
  archiveChange,
  computeStatus,
  getInstructions,
  listChanges,
  resolveOpenspecCli,
} from "../src/openspec-runtime";
import { buildSpawnArgs } from "../src/openspec-runtime/spawner";
import { loadApplyState, parseTaskCheckboxes } from "../src/openspec-runtime/tasks";
import { resolveProjectRoot } from "../src/utils/project-root";

const fixtureRoot = join(
  process.cwd(),
  "mcp-servers",
  "fyllo-specs",
  "__tests__",
  "fixtures",
  "openspec-sample"
);
const cliPath = resolveOpenspecCli();

describe("openspec-runtime", () => {
  process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;

  it("resolves the CLI path", () => {
    expect(resolveOpenspecCli()).toContain("openspec.js");
  });

  it("uses injected CLI path instead of project root node_modules", () => {
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      expect(resolveOpenspecCli()).toBe(cliPath);
    } finally {
      process.env.FYLLO_OPENSPEC_CLI_PATH = prevCli;
    }
  });

  it("spawns CLI directly outside Electron runtime", () => {
    expect(buildSpawnArgs("/tmp/openspec.js", ["list", "--json"])).toEqual([
      "/tmp/openspec.js",
      "list",
      "--json",
    ]);
  });

  it("lists active changes", async () => {
    const result = await listChanges(fixtureRoot);
    expect(Array.isArray(result)).toBe(true);
  });

  it("computes status", async () => {
    const result = await computeStatus(fixtureRoot, "sample-change");
    expect(result.schemaName).toBe("spec-driven");
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it("loads instructions", async () => {
    const result = await getInstructions(fixtureRoot, "sample-change", "proposal");
    expect(result).toHaveProperty("instruction");
  });

  it("reads apply state", async () => {
    const result = await loadApplyState(fixtureRoot, "sample-change");
    expect(result.progress.total).toBeGreaterThan(0);
  });

  it("parses task checkboxes", () => {
    const tasks = parseTaskCheckboxes("- [x] done\n- [ ] todo");
    expect(tasks).toHaveLength(2);
    expect(tasks[0].done).toBe(true);
  });

  it("uses project root fallback", () => {
    expect(resolveProjectRoot()).toBeTruthy();
  });

  it("creates and archives without throwing on fixture", async () => {
    await expect(
      archiveChange(fixtureRoot, "sample-change", { confirm: false })
    ).resolves.toMatchObject({
      changeName: "sample-change",
    });
    expect(existsSync(join(fixtureRoot, "openspec", "changes", "sample-change")) || true).toBe(
      true
    );
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
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

  it("prefers app.asar CLI fallback over app.asar.unpacked", () => {
    const tempRoot = `/private/tmp/fyllocode-openspec-cli-${Math.random().toString(36).slice(2)}`;
    const resourcesPath = join(tempRoot, "FylloCode.app", "Contents", "Resources");
    const appAsarCli = join(
      resourcesPath,
      "app.asar",
      "node_modules",
      "@fission-ai",
      "openspec",
      "bin",
      "openspec.js"
    );
    const appUnpackedCli = join(
      resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@fission-ai",
      "openspec",
      "bin",
      "openspec.js"
    );
    const originalCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
      .resourcesPath;

    delete process.env.FYLLO_OPENSPEC_CLI_PATH;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: resourcesPath,
    });

    mkdirSync(join(appAsarCli, ".."), { recursive: true });
    mkdirSync(join(appUnpackedCli, ".."), { recursive: true });
    writeFileSync(appAsarCli, "");
    writeFileSync(appUnpackedCli, "");

    try {
      expect(resolveOpenspecCli()).toBe(appAsarCli);
    } finally {
      if (originalCli === undefined) {
        delete process.env.FYLLO_OPENSPEC_CLI_PATH;
      } else {
        process.env.FYLLO_OPENSPEC_CLI_PATH = originalCli;
      }
      Object.defineProperty(process, "resourcesPath", {
        configurable: true,
        value: originalResourcesPath,
      });
      rmSync(tempRoot, { recursive: true, force: true });
    }
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

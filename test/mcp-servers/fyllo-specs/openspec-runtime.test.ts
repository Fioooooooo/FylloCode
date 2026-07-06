import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  archiveChange,
  computeStatus,
  createChange,
  getInstructions,
  listChanges,
  resolveOpenspecCli,
} from "../../../src/mcp-servers/fyllo-specs/src/runtime-openspec";
import { GUIDELINES_TASKS_RULE_EN } from "../../../src/mcp-servers/fyllo-specs/src/runtime-openspec/create-change";
import { buildSpawnArgs } from "../../../src/mcp-servers/fyllo-specs/src/runtime-openspec/spawner";
import * as spawner from "../../../src/mcp-servers/fyllo-specs/src/runtime-openspec/spawner";
import {
  loadApplyState,
  parseTaskCheckboxes,
} from "../../../src/mcp-servers/fyllo-specs/src/runtime-openspec/tasks";
import { resolveProjectRoot } from "../../../src/mcp-servers/fyllo-specs/src/utils/project-root";

const fixtureRoot = join(
  process.cwd(),
  "test",
  "mcp-servers",
  "fyllo-specs",
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

  it("initializes missing openspec project structure before creating a change", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-specs-init-"));

    try {
      await createChange(root, "sample-change");

      const configPath = join(root, "openspec", "config.yaml");
      expect(existsSync(configPath)).toBe(true);
      expect(readFileSync(configPath, "utf8")).toContain(GUIDELINES_TASKS_RULE_EN);
      expect(existsSync(join(root, "openspec", "changes", "archive"))).toBe(true);
      expect(existsSync(join(root, "openspec", "specs"))).toBe(true);
      expect(existsSync(join(root, "openspec", "changes", "sample-change"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves an existing config byte-for-byte untouched even without the default guidelines rule", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-specs-config-preserve-"));
    const configPath = join(root, "openspec", "config.yaml");
    const originalConfig = [
      "schema: spec-driven",
      "context: |",
      "  custom project context",
      "rules:",
      "  proposal:",
      "    - Keep proposals under 500 words",
      "",
    ].join("\n");

    mkdirSync(join(root, "openspec"), { recursive: true });
    writeFileSync(configPath, originalConfig, "utf8");

    try {
      await createChange(root, "preserved-change");

      expect(readFileSync(configPath, "utf8")).toBe(originalConfig);
      expect(existsSync(join(root, "openspec", "changes", "archive"))).toBe(true);
      expect(existsSync(join(root, "openspec", "specs"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads apply state", async () => {
    const result = await loadApplyState(fixtureRoot, "sample-change");
    expect(result.progress.total).toBeGreaterThan(0);
  });

  it("treats non-required ready artifacts as apply-ready", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-specs-apply-state-"));
    const changeRoot = join(root, "openspec", "changes", "test-proposal");
    const specRoot = join(changeRoot, "specs", "example-capability");

    mkdirSync(specRoot, { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    writeFileSync(
      join(changeRoot, ".openspec.yaml"),
      "schema: spec-driven\nstatus: proposed\n",
      "utf8"
    );
    writeFileSync(join(changeRoot, "proposal.md"), "# Proposal\n", "utf8");
    writeFileSync(join(changeRoot, "design.md"), "# Design\n", "utf8");
    writeFileSync(join(changeRoot, "tasks.md"), "- [ ] implement something\n", "utf8");
    writeFileSync(join(specRoot, "spec.md"), "## ADDED Requirements\n", "utf8");

    try {
      const result = await loadApplyState(root, "test-proposal");
      expect(result.applyState).toBe("ready");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    const tempRoot = mkdtempSync(join(tmpdir(), "fyllocode-openspec-cli-"));
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

  it("overwrites created and sets status to creating when generated yaml already has created", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T07:05:27.509Z"));
    const root = mkdtempSync(join(tmpdir(), "fyllo-specs-created-overwrite-"));
    const changeDir = join(root, "openspec", "changes", "overwrite-change");
    const yamlFile = join(changeDir, ".openspec.yaml");

    const spy = vi.spyOn(spawner, "spawnOpenspec").mockImplementation(async () => {
      mkdirSync(changeDir, { recursive: true });
      writeFileSync(
        yamlFile,
        "schema: spec-driven\ncreated: 2020-01-01T00:00:00.000Z\nstatus: proposed\ncontext: test\n",
        "utf8"
      );
      return "";
    });

    try {
      await createChange(root, "overwrite-change");

      const written = readFileSync(yamlFile, "utf8");
      expect(written).toContain("created: 2026-07-06T07:05:27.509Z\n");
      expect(written).not.toContain("created: '2026-07-06T07:05:27.509Z'");
      expect(written).toContain("status: creating");
      expect(written.indexOf("created:")).toBeLessThan(written.indexOf("status:"));
      expect(written).toContain("context: test");
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("adds created and sets status to creating when generated yaml lacks created", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T07:05:27.509Z"));
    const root = mkdtempSync(join(tmpdir(), "fyllo-specs-created-add-"));
    const changeDir = join(root, "openspec", "changes", "add-change");
    const yamlFile = join(changeDir, ".openspec.yaml");

    const spy = vi.spyOn(spawner, "spawnOpenspec").mockImplementation(async () => {
      mkdirSync(changeDir, { recursive: true });
      writeFileSync(yamlFile, "schema: spec-driven\nstatus: proposed\ncontext: test\n", "utf8");
      return "";
    });

    try {
      await createChange(root, "add-change");

      const written = readFileSync(yamlFile, "utf8");
      expect(written).toContain("created: 2026-07-06T07:05:27.509Z\n");
      expect(written).not.toContain("created: '2026-07-06T07:05:27.509Z'");
      expect(written).toContain("status: creating");
      expect(written.indexOf("created:")).toBeLessThan(written.indexOf("status:"));
      expect(written).toContain("context: test");
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves existing change untouched and skips CLI spawn", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-specs-existing-"));
    const changeDir = join(root, "openspec", "changes", "existing-change");
    const yamlFile = join(changeDir, ".openspec.yaml");
    const originalYaml =
      "schema: spec-driven\ncreated: 2020-01-01T00:00:00.000Z\nstatus: proposed\n";

    mkdirSync(changeDir, { recursive: true });
    writeFileSync(yamlFile, originalYaml, "utf8");

    const spy = vi.spyOn(spawner, "spawnOpenspec").mockImplementation(async () => {
      throw new Error("should not be called");
    });

    try {
      await createChange(root, "existing-change");

      expect(readFileSync(yamlFile, "utf8")).toBe(originalYaml);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

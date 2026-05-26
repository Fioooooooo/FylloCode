import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import spawn from "cross-spawn";
import { describe, expect, it, vi } from "vitest";
import { applyChangeTool } from "../src/tools/apply-change";
import { createProposalTool } from "../src/tools/create-proposal";
import { archiveChangeTool } from "../src/tools/archive-change";
import { exploreTool } from "../src/tools/explore";
import { registerTools } from "../src/tools";
import { gitChildProcess } from "../src/utils/project-root";

function git(cwd: string, args: string[]): void {
  const result = spawn.sync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
}

function initGitRepo(root: string): void {
  git(root, ["init"]);
  git(root, ["config", "user.name", "Fyllo Test"]);
  git(root, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(root, "README.md"), "initial\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "chore(test): initial"]);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function parseState(text: string): Record<string, unknown> {
  const match = text.match(/<state>\n([\s\S]+?)\n<\/state>/);
  if (match) return JSON.parse(match[1]);
  // When includeInstruction is false, the response is plain JSON without XML tags
  return JSON.parse(text);
}

async function createToolClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const server = new McpServer({ name: "fyllo-specs-test", version: "1.0.0" });
  registerTools(server);
  const client = new Client({ name: "fyllo-specs-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await clientTransport.close();
      await serverTransport.close();
      await server.close();
    },
  };
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
  const repoRoot = process.cwd();

  it("explore returns state", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = repoRoot;
    try {
      const text = await exploreTool({ targetPath: repoRoot });
      expect(text).toContain("<tool_instruction>");
      expect(text).toContain("<state>");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("tools reject missing targetPath via MCP SDK validation", async () => {
    const { client, close } = await createToolClient();
    try {
      const exploreResult = await client.request(
        { method: "tools/call", params: { name: "explore", arguments: {} } },
        CallToolResultSchema
      );
      expect(exploreResult.isError).toBe(true);
      expect(exploreResult.content[0].type).toBe("text");
      expect(exploreResult.content[0].text).toContain(String(ErrorCode.InvalidParams));
      expect(exploreResult.content[0].text).toContain("targetPath");

      const createProposalResult = await client.request(
        {
          method: "tools/call",
          params: { name: "create-proposal", arguments: { changeName: "sample-change" } },
        },
        CallToolResultSchema
      );
      expect(createProposalResult.isError).toBe(true);
      expect(createProposalResult.content[0].type).toBe("text");
      expect(createProposalResult.content[0].text).toContain(String(ErrorCode.InvalidParams));
      expect(createProposalResult.content[0].text).toContain("targetPath");

      const applyChangeResult = await client.request(
        {
          method: "tools/call",
          params: { name: "apply-change", arguments: { changeName: "sample-change" } },
        },
        CallToolResultSchema
      );
      expect(applyChangeResult.isError).toBe(true);
      expect(applyChangeResult.content[0].type).toBe("text");
      expect(applyChangeResult.content[0].text).toContain(String(ErrorCode.InvalidParams));
      expect(applyChangeResult.content[0].text).toContain("targetPath");

      const archiveChangeResult = await client.request(
        {
          method: "tools/call",
          params: { name: "archive-change", arguments: { changeName: "sample-change" } },
        },
        CallToolResultSchema
      );
      expect(archiveChangeResult.isError).toBe(true);
      expect(archiveChangeResult.content[0].type).toBe("text");
      expect(archiveChangeResult.content[0].text).toContain(String(ErrorCode.InvalidParams));
      expect(archiveChangeResult.content[0].text).toContain("targetPath");
    } finally {
      await close();
    }
  });

  it("explore rejects relative targetPath without calling git", async () => {
    const spawnSyncSpy = vi.spyOn(gitChildProcess, "spawnSync");
    try {
      const text = await exploreTool({ targetPath: "./relative-path" });
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ type: string }>)[0].type).toBe("InvalidTargetPath");
      expect((state.errors as Array<{ message: string }>)[0].message).toContain(
        "targetPath must be an absolute path"
      );
      expect(spawnSyncSpy).not.toHaveBeenCalled();
    } finally {
      spawnSyncSpy.mockRestore();
    }
  });

  it("explore returns plain JSON when includeInstruction is false", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = repoRoot;
    try {
      const text = await exploreTool({ targetPath: repoRoot, includeInstruction: false });
      expect(text).not.toContain("<tool_instruction>");
      const state = JSON.parse(text);
      expect(state).toHaveProperty("activeChanges");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("create-proposal returns error state for invalid input", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = repoRoot;
    try {
      const text = await createProposalTool({ changeName: "bad name", targetPath: repoRoot });
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("kebab-case");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("create-proposal uses explicit main workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await createProposalTool({
        changeName: "main-workspace-change",
        targetPath: root,
        workspaceMode: "main",
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      expect(state.workspace).toEqual({ mode: "main", path: root });
      expect(state.warnings).toEqual([]);
      expect(existsSync(join(root, "openspec", "config.yaml"))).toBe(true);
      expect(existsSync(join(root, "openspec", "changes", "archive"))).toBe(true);
      expect(existsSync(join(root, "openspec", "specs"))).toBe(true);
      expect(existsSync(join(root, "openspec", "changes", "main-workspace-change"))).toBe(true);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("create-proposal falls back to main workspace for non-git linked mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await createProposalTool({
        changeName: "fallback-change",
        targetPath: root,
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      expect(state.workspace).toEqual({ mode: "main", path: root });
      expect((state.warnings as string[])[0]).toContain("not a git repo");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("create-proposal defaults to linked workspace for git projects", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    initGitRepo(root);

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await createProposalTool({
        changeName: "linked-workspace-change",
        targetPath: root,
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      const workspacePath = join(root, ".worktrees", "linked-workspace-change");
      expect(state.workspace).toEqual({ mode: "linked", path: workspacePath });
      expect(
        existsSync(join(workspacePath, "openspec", "changes", "linked-workspace-change"))
      ).toBe(true);
      expect(existsSync(join(workspacePath, "openspec", "config.yaml"))).toBe(true);
      expect(existsSync(join(workspacePath, "openspec", "changes", "archive"))).toBe(true);
      expect(existsSync(join(workspacePath, "openspec", "specs"))).toBe(true);
      expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain(".worktrees/");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("create-proposal returns plain JSON error when includeInstruction is false", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = repoRoot;
    try {
      const text = await createProposalTool({
        changeName: "bad name",
        targetPath: repoRoot,
        includeInstruction: false,
      });
      expect(text).not.toContain("<tool_instruction>");
      const state = JSON.parse(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("kebab-case");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("create-proposal rejects unregistered absolute targetPath with git output", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = repoRoot;
    try {
      const text = await createProposalTool({
        changeName: "valid-change",
        targetPath: "/tmp/random-path",
      });
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ type: string }>)[0].type).toBe("InvalidTargetPath");
      expect((state.errors as Array<{ message: string }>)[0].message).toContain(
        "targetPath is not a registered git worktree"
      );
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("worktree ");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("explore accepts the git project root targetPath", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = repoRoot;
    try {
      const text = await exploreTool({ targetPath: repoRoot, includeInstruction: false });
      const state = JSON.parse(text);
      expect(state.projectRoot).toBe(repoRoot);
      expect(state.activeChanges).toBeInstanceOf(Array);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("explore accepts targetPath with trailing slash", async () => {
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = repoRoot;
    try {
      const text = await exploreTool({ targetPath: `${repoRoot}/`, includeInstruction: false });
      const state = JSON.parse(text);
      expect(state.projectRoot).toBe(repoRoot);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("explore uses non-git fallback only for the project root", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");

    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const okText = await exploreTool({ targetPath: root, includeInstruction: false });
      const okState = JSON.parse(okText);
      expect(okState.projectRoot).toBe(root);

      const badText = await exploreTool({ targetPath: "/tmp/elsewhere" });
      const badState = parseState(badText);
      expect((badState.errors as Array<{ type: string }>)[0].type).toBe("InvalidTargetPath");
      expect((badState.errors as Array<{ message: string }>)[0].message).toContain(
        "targetPath must be the project root for non-git projects"
      );
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("apply-change returns ready for the active change", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const changeName = "test-apply-ready";
    const changeRoot = join(root, "openspec", "changes", changeName);
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

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const text = await applyChangeTool({
        changeName,
        targetPath: root,
      });
      expect(text).toContain(`"changeName": "${changeName}"`);
      expect(text).toContain('"applyState": "ready"');
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
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
      const text = await applyChangeTool({ changeName: "missing-change", targetPath: root });
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("Change not found");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
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
      const text = await archiveChangeTool({ changeName: "missing-change", targetPath: root });
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("Change not found");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("archive-change preview returns structured state without commitMessage", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const changeDir = join(root, "openspec", "changes", "test-preview");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    writeFileSync(
      join(changeDir, ".openspec.yaml"),
      "schema: spec-driven\nstatus: applying\n",
      "utf8"
    );
    writeFileSync(join(changeDir, "tasks.md"), "- [ ] todo\n", "utf8");

    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await archiveChangeTool({
        changeName: "test-preview",
        targetPath: root,
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      expect(state.archive.archiveTarget).toContain("test-preview");
      expect(state.archive.archiveRawOutput).toBeNull();
      expect(state.archive.incompleteTasks).toBe(1);
      expect(state.workspace.gitOps).toEqual([]);
      expect(state.workspace.recovery.required).toBe("none");
      expect(existsSync(changeDir)).toBe(true);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("archive-change rejects invalid commitMessage before archiving", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const changeDir = join(root, "openspec", "changes", "test-invalid-message");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    writeFileSync(
      join(changeDir, ".openspec.yaml"),
      "schema: spec-driven\nstatus: applying\n",
      "utf8"
    );
    writeFileSync(join(changeDir, "tasks.md"), "- [x] done\n", "utf8");

    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await archiveChangeTool({
        changeName: "test-invalid-message",
        targetPath: root,
        confirm: true,
        commitMessage: "bad message",
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      expect(state.status).toBe("failed");
      expect(state.archive.ok).toBe(false);
      expect(state.archive.error.code).toBe("invalid-commit-message");
      expect(state.workspace.gitOps).toEqual([]);
      expect(state.workspace.recovery.required).toBe("none");
      expect(existsSync(changeDir)).toBe(true);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("archive-change successfully archives a change with confirm: true", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const changeDir = join(root, "openspec", "changes", "test-archive");
    mkdirSync(changeDir, { recursive: true });
    initGitRepo(root);
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
      const text = await archiveChangeTool({
        changeName: "test-archive",
        targetPath: root,
        confirm: true,
        commitMessage: "chore(specs): archive test archive",
      });
      const state = parseState(text);
      expect(state.errors).toBeUndefined();
      expect(state.changeName).toBe("test-archive");
      expect((state.archive as { incompleteTasks: number }).incompleteTasks).toBe(1);
      expect((state.archive as { archiveTarget: string }).archiveTarget).toContain("test-archive");
      expect(typeof (state.archive as { archiveRawOutput: string }).archiveRawOutput).toBe(
        "string"
      );
      expect(
        (state.archive as { archiveRawOutput: string }).archiveRawOutput.length
      ).toBeGreaterThan(0);
      expect((state.workspace as { mode: string }).mode).toBe("main");
      expect(
        (state.workspace as { gitOps: Array<{ step: string }> }).gitOps.map((op) => op.step)
      ).toEqual(["commit"]);
      expect((state.workspace as { gitOps: Array<{ outcome?: string }> }).gitOps[0].outcome).toBe(
        "created"
      );
      expect((state.workspace as { recovery: { required: string } }).recovery.required).toBe(
        "none"
      );
      expect(existsSync(changeDir)).toBe(false);
      const archiveTarget = (state.archive as { archiveTarget: string }).archiveTarget;
      expect(existsSync(archiveTarget)).toBe(true);
      expect(existsSync(join(archiveTarget, "tasks.md"))).toBe(true);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("archive-change syncs delta specs before archiving", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const changeDir = join(root, "openspec", "changes", "test-sync-spec");
    const mainSpecDir = join(root, "openspec", "specs", "test-cap");
    mkdirSync(changeDir, { recursive: true });
    mkdirSync(mainSpecDir, { recursive: true });

    writeFileSync(
      join(mainSpecDir, "spec.md"),
      "# test-cap Specification\n\n## Purpose\nTest.\n\n## Requirements\n\n### Requirement: Existing\n\nSystem SHALL do the original thing.\n\n#### Scenario: Original scenario\n\n- **WHEN** something happens\n- **THEN** it works\n",
      "utf8"
    );

    const specChangeDir = join(changeDir, "specs", "test-cap");
    mkdirSync(specChangeDir, { recursive: true });
    writeFileSync(
      join(specChangeDir, "spec.md"),
      "## MODIFIED Requirements\n\n### Requirement: Existing\n\nSystem SHALL do the updated thing.\n\n#### Scenario: Updated scenario\n\n- **WHEN** something new happens\n- **THEN** it works better\n\n## ADDED Requirements\n\n### Requirement: New One\n\nSystem SHALL support the new feature.\n\n#### Scenario: New scenario\n\n- **WHEN** new feature is used\n- **THEN** it succeeds\n",
      "utf8"
    );

    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    initGitRepo(root);
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
      const text = await archiveChangeTool({
        changeName: "test-sync-spec",
        targetPath: root,
        confirm: true,
        commitMessage: "chore(specs): archive synced spec",
      });
      const state = parseState(text);
      expect(state.errors).toBeUndefined();
      expect(state.changeName).toBe("test-sync-spec");
      expect(typeof (state.archive as { archiveRawOutput: string }).archiveRawOutput).toBe(
        "string"
      );
      expect(
        (state.archive as { archiveRawOutput: string }).archiveRawOutput.length
      ).toBeGreaterThan(0);

      const mainSpecContent = readFileSync(join(mainSpecDir, "spec.md"), "utf8");
      expect(mainSpecContent).toContain("System SHALL do the updated thing.");
      expect(mainSpecContent).toContain("System SHALL support the new feature.");

      expect(existsSync(changeDir)).toBe(false);
      expect(existsSync((state.archive as { archiveTarget: string }).archiveTarget)).toBe(true);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });
});

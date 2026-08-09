import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import spawn from "cross-spawn";
import { describe, expect, it, vi } from "vitest";
import { archiveChangeTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/archive-change";
import { exploreTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/explore";
import { registerTools } from "../../../src/mcp-servers/fyllo-specs/src/tools";
import { loadPrompt } from "../../../src/mcp-servers/fyllo-specs/src/utils/load-prompt";

vi.mock("../../../src/mcp-servers/shared/workspace-context", () => ({
  getWorkspaceContext: () => {
    const configuredPath = process.env.FYLLO_PROJECT_PATH ?? process.cwd();
    const folderPath = existsSync(configuredPath)
      ? realpathSync.native(configuredPath)
      : configuredPath;
    return {
      version: 2,
      workspaceId: "workspace-test",
      workspaceKind: "folder",
      primaryFolderId: "folder-test",
      folders: [{ folderId: "folder-test", folderName: "Test", folderPath }],
      workspaceDataDir: process.env.FYLLO_PROJECT_DATA_DIR ?? "/tmp/fyllo-test-data",
    };
  },
}));

function git(cwd: string, args: string[]): void {
  const result = spawn.sync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function createGitOpenspecFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
  mkdirSync(join(root, "openspec", "changes"), { recursive: true });
  writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
  git(root, ["init"]);
  git(root, ["config", "user.name", "Fyllo Test"]);
  git(root, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(root, "README.md"), "initial\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "chore(test): initial"]);
  return root;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function createToolClient(): Promise<{ client: Client; close: () => Promise<void> }> {
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

describe("fyllo-specs tools", () => {
  it("publishes owner-qualified proposal contracts without caller paths", async () => {
    const { client, close } = await createToolClient();
    try {
      const definitions = (await client.listTools()).tools;
      const byName = (name: string) => definitions.find((tool) => tool.name === name)?.inputSchema;

      expect(byName("create-proposal")?.properties).toHaveProperty("folderId");
      expect(byName("create-proposal")?.properties).toHaveProperty("worktreeMode");
      expect(byName("explore")?.properties).toHaveProperty("folderId");
      expect(byName("apply-change")?.required).toEqual(
        expect.arrayContaining(["folderId", "changeName"])
      );
      expect(byName("archive-change")?.required).toEqual(
        expect.arrayContaining(["folderId", "changeName"])
      );
      for (const name of ["create-proposal", "explore", "apply-change", "archive-change"]) {
        expect(byName(name)?.properties).not.toHaveProperty("targetPath");
        expect(byName(name)?.properties).not.toHaveProperty("workspacePath");
      }
    } finally {
      await close();
    }
  });

  it("explores the authorized Folder from the Workspace descriptor", async () => {
    const root = createGitOpenspecFixture();
    const previous = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const state = JSON.parse(await exploreTool({ includeInstruction: false }));
      expect(state.activeChanges).toEqual([]);
      expect(state.warnings).toEqual([]);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", previous);
    }
  });

  it("keeps the archive instruction's generated Purpose repair checkpoint", async () => {
    const root = createGitOpenspecFixture();
    const changeName = "purpose-check";
    const changeDir = join(root, "openspec", "changes", changeName);
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(
      join(changeDir, ".openspec.yaml"),
      "schema: spec-driven\nstatus: applying\n",
      "utf8"
    );
    writeFileSync(join(changeDir, "tasks.md"), "- [x] done\n", "utf8");
    const previous = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await archiveChangeTool({ folderId: "folder-test", changeName });
      expect(text).toContain("Check generated spec Purpose");
      expect(text).toContain("TBD - created by archiving change");
      expect(text).toContain("leave a separate follow-up commit for the Purpose repair");
      expect(text).toContain("git commit --amend --no-edit");
      expect(text).toContain("single-commit check result");
      expect(text).not.toContain('Offer options: "Sync now (recommended)"');
      expect(text).not.toContain('"Archive without syncing"');
      expect(text).not.toContain("Sync skipped");
      expect(text).toContain("## Archive Complete");
      expect(text).toContain("## Archive Partially Complete");
      expect(text).toContain(
        "**Archived proposal:** [View proposal](<final-archive-proposal-file-path>)"
      );
      expect(text).toContain("[View specification](<final-spec-file-path>)");
      expect(text).toContain("**Repository update:** Complete");
      expect(text).toContain("Do not link to an archive directory");
      expect(text).toContain("do not use the stale `state.archive.archiveTarget`");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", previous);
    }
  });

  it("requires apply task checkboxes to be updated one task at a time", () => {
    const instruction = loadPrompt("apply-change");

    expect(instruction).toContain(
      "Do not start another pending task until the completed task's checkbox has been updated"
    );
    expect(instruction).toContain(
      "Never defer checkbox updates or batch-mark multiple tasks after the implementation work is finished"
    );
    expect(instruction).toContain("## Implementing: <change-name>");
    expect(instruction).toContain("**Tasks:** [View task checklist](<absolute-tasks-file-path>)");
    expect(instruction).toContain("✓ Task complete; checklist updated");
    expect(instruction).toContain("**Checks:** <verification summary>");
    expect(instruction).toContain("do not link to a directory");
    expect(instruction).not.toContain("## Implementing: <change-name> (schema: <schema-name>)");
  });
});

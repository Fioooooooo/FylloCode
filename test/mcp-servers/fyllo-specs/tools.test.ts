import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResultSchema,
  ErrorCode,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import spawn from "cross-spawn";
import { describe, expect, it, vi } from "vitest";
import { applyChangeTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/apply-change";
import { createPlanTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/create-plan";
import { createProposalTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/create-proposal";
import { archiveChangeTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/archive-change";
import { exploreTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/explore";
import { registerTools } from "../../../src/mcp-servers/fyllo-specs/src/tools";
import { gitChildProcess } from "../../../src/mcp-servers/fyllo-specs/src/utils/project-root";

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

function createGitOpenspecFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
  mkdirSync(join(root, "openspec", "changes"), { recursive: true });
  writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
  initGitRepo(root);
  return root;
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

function firstTextContent(result: CallToolResult): string {
  const first = result.content[0];
  expect(first?.type).toBe("text");
  if (!first || first.type !== "text") {
    throw new Error("Expected first MCP content item to be text");
  }
  return first.text;
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
    const root = createGitOpenspecFixture();
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await exploreTool({ targetPath: root });
      expect(text).toContain("<tool_instruction>");
      expect(text).toContain("<state>");
      const state = parseState(text);
      expect(state).not.toHaveProperty("errors");
      expect(state.activeChanges).toBeInstanceOf(Array);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("path-bound tools reject missing targetPath via MCP SDK validation", async () => {
    const { client, close } = await createToolClient();
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "apply-change",
        "archive-change",
        "create-plan",
        "create-proposal",
        "explore",
      ]);
      const createPlanToolDefinition = tools.tools.find((tool) => tool.name === "create-plan");
      expect(createPlanToolDefinition?.description).toContain(
        "requires exploration or architectural trade-offs"
      );
      expect(createPlanToolDefinition?.description).toContain(
        "does not change the behavior contract"
      );
      expect(createPlanToolDefinition?.description).toContain(
        "public APIs, schemas, protocols, persistence formats"
      );
      expect(createPlanToolDefinition?.description).toContain("use create-proposal instead");
      expect(createPlanToolDefinition?.inputSchema).toMatchObject({
        type: "object",
        required: ["goal", "slug"],
        properties: {
          goal: {
            description: "One-sentence summary of what this plan aims to achieve.",
          },
          slug: {
            description:
              "Short kebab-case identifier for the plan, e.g. 'refactor-auth-flow'. Must not include a date prefix.",
          },
        },
      });
      expect(createPlanToolDefinition?.inputSchema.properties).not.toHaveProperty("targetPath");

      const exploreResult = await client.request(
        { method: "tools/call", params: { name: "explore", arguments: {} } },
        CallToolResultSchema
      );
      expect(exploreResult.isError).toBe(true);
      const exploreText = firstTextContent(exploreResult);
      expect(exploreText).toContain(String(ErrorCode.InvalidParams));
      expect(exploreText).toContain("targetPath");

      const createProposalResult = await client.request(
        {
          method: "tools/call",
          params: { name: "create-proposal", arguments: { changeName: "sample-change" } },
        },
        CallToolResultSchema
      );
      expect(createProposalResult.isError).toBe(true);
      const createProposalText = firstTextContent(createProposalResult);
      expect(createProposalText).toContain(String(ErrorCode.InvalidParams));
      expect(createProposalText).toContain("targetPath");

      const applyChangeResult = await client.request(
        {
          method: "tools/call",
          params: { name: "apply-change", arguments: { changeName: "sample-change" } },
        },
        CallToolResultSchema
      );
      expect(applyChangeResult.isError).toBe(true);
      const applyChangeText = firstTextContent(applyChangeResult);
      expect(applyChangeText).toContain(String(ErrorCode.InvalidParams));
      expect(applyChangeText).toContain("targetPath");

      const archiveChangeResult = await client.request(
        {
          method: "tools/call",
          params: { name: "archive-change", arguments: { changeName: "sample-change" } },
        },
        CallToolResultSchema
      );
      expect(archiveChangeResult.isError).toBe(true);
      const archiveChangeText = firstTextContent(archiveChangeResult);
      expect(archiveChangeText).toContain(String(ErrorCode.InvalidParams));
      expect(archiveChangeText).toContain("targetPath");
    } finally {
      await close();
    }
  });

  it("create-plan rejects path and instruction control inputs", async () => {
    const { client, close } = await createToolClient();
    try {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "create-plan",
            arguments: {
              goal: "Plan first",
              slug: "plan-first",
              targetPath: repoRoot,
              includeInstruction: false,
            },
          },
        },
        CallToolResultSchema
      );
      expect(result.isError).toBe(true);
      const text = firstTextContent(result);
      expect(text).toContain(String(ErrorCode.InvalidParams));
      expect(text).toContain("targetPath");
      expect(text).toContain("includeInstruction");
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
    const root = createGitOpenspecFixture();
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await exploreTool({ targetPath: root, includeInstruction: false });
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

  it("create-plan returns error state for invalid slug", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const prevDataDir = process.env.FYLLO_PROJECT_DATA_DIR;
    const prevSessionId = process.env.FYLLO_SESSION_ID;
    process.env.FYLLO_PROJECT_DATA_DIR = join(root, "data");
    process.env.FYLLO_SESSION_ID = "session-1";
    try {
      const text = await createPlanTool({
        goal: "Need a plan",
        slug: "2026-06-29-plan-a",
      });
      expect(text).toContain("<tool_instruction>");
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("date prefix");
    } finally {
      restoreEnv("FYLLO_PROJECT_DATA_DIR", prevDataDir);
      restoreEnv("FYLLO_SESSION_ID", prevSessionId);
    }
  });

  it("create-plan requires project data and session env before creating files", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const dataDir = join(root, "data");
    const prevDataDir = process.env.FYLLO_PROJECT_DATA_DIR;
    const prevSessionId = process.env.FYLLO_SESSION_ID;
    process.env.FYLLO_PROJECT_DATA_DIR = dataDir;
    delete process.env.FYLLO_SESSION_ID;
    try {
      const text = await createPlanTool({
        goal: "Need a plan",
        slug: "plan-a",
      });
      expect(text).toContain("<tool_instruction>");
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect((state.errors as Array<{ message: string }>)[0].message).toContain("FYLLO_SESSION_ID");
      expect(existsSync(dataDir)).toBe(false);
    } finally {
      restoreEnv("FYLLO_PROJECT_DATA_DIR", prevDataDir);
      restoreEnv("FYLLO_SESSION_ID", prevSessionId);
    }
  });

  it("create-plan creates a plan skeleton and writes a plan event", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const dataDir = join(root, "data");
    const eventDir = join(root, "events");
    const prevDataDir = process.env.FYLLO_PROJECT_DATA_DIR;
    const prevSessionId = process.env.FYLLO_SESSION_ID;
    const prevEventDir = process.env.FYLLO_MCP_EVENT_DIR;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T08:00:00.000Z"));
    process.env.FYLLO_PROJECT_DATA_DIR = dataDir;
    process.env.FYLLO_SESSION_ID = "session-1";
    process.env.FYLLO_MCP_EVENT_DIR = eventDir;
    try {
      const text = await createPlanTool({
        goal: "Need a plan",
        slug: "plan-a",
      });
      expect(text).toContain("<tool_instruction>");
      const state = parseState(text);
      const planPath = join(dataDir, "sessions", "session-1", "plans", "2026-06-29-plan-a.md");
      expect(state).toEqual({ planPath });
      const plan = readFileSync(planPath, "utf8");
      expect(plan).toContain("slug: 2026-06-29-plan-a");
      expect(plan).toContain('goal: "Need a plan"');
      expect(plan).toContain("status: draft");
      expect(plan).toContain("## 任务目标/Goal");
      expect(plan).toContain("## 验证方式/Verification");

      const files = readdirSync(eventDir);
      expect(files).toHaveLength(1);
      expect(JSON.parse(readFileSync(join(eventDir, files[0]!), "utf8"))).toMatchObject({
        server: "fyllo-specs",
        tool: "create-plan",
        sessionId: "session-1",
        planSlug: "2026-06-29-plan-a",
        createdAt: expect.any(String),
      });
    } finally {
      vi.useRealTimers();
      restoreEnv("FYLLO_PROJECT_DATA_DIR", prevDataDir);
      restoreEnv("FYLLO_SESSION_ID", prevSessionId);
      restoreEnv("FYLLO_MCP_EVENT_DIR", prevEventDir);
    }
  });

  it("create-plan does not overwrite an existing plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const dataDir = join(root, "data");
    const planPath = join(dataDir, "sessions", "session-1", "plans", "2026-06-29-plan-a.md");
    mkdirSync(join(dataDir, "sessions", "session-1", "plans"), { recursive: true });
    writeFileSync(planPath, "existing", "utf8");
    const prevDataDir = process.env.FYLLO_PROJECT_DATA_DIR;
    const prevSessionId = process.env.FYLLO_SESSION_ID;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T08:00:00.000Z"));
    process.env.FYLLO_PROJECT_DATA_DIR = dataDir;
    process.env.FYLLO_SESSION_ID = "session-1";
    try {
      const text = await createPlanTool({
        goal: "Need a plan",
        slug: "plan-a",
      });
      expect(text).toContain("<tool_instruction>");
      const state = parseState(text);
      expect(state.errors).toBeInstanceOf(Array);
      expect(readFileSync(planPath, "utf8")).toBe("existing");
    } finally {
      vi.useRealTimers();
      restoreEnv("FYLLO_PROJECT_DATA_DIR", prevDataDir);
      restoreEnv("FYLLO_SESSION_ID", prevSessionId);
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

  it("create-proposal writes a proposal event when event env is present", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const eventDir = join(root, "events");

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    const prevEventDir = process.env.FYLLO_MCP_EVENT_DIR;
    const prevSessionId = process.env.FYLLO_SESSION_ID;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    process.env.FYLLO_MCP_EVENT_DIR = eventDir;
    process.env.FYLLO_SESSION_ID = "session-1";
    try {
      const text = await createProposalTool({
        changeName: "event-change",
        targetPath: root,
        workspaceMode: "main",
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      const files = readdirSync(eventDir);
      expect(state.changeName).toBe("event-change");
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d+-[A-Za-z0-9_-]+\.json$/);
      expect(JSON.parse(readFileSync(join(eventDir, files[0]!), "utf8"))).toMatchObject({
        server: "fyllo-specs",
        tool: "create-proposal",
        sessionId: "session-1",
        changeId: "event-change",
        createdAt: expect.any(String),
      });
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
      restoreEnv("FYLLO_MCP_EVENT_DIR", prevEventDir);
      restoreEnv("FYLLO_SESSION_ID", prevSessionId);
    }
  });

  it("create-proposal skips event write when FYLLO_SESSION_ID is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const eventDir = join(root, "events");

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    const prevEventDir = process.env.FYLLO_MCP_EVENT_DIR;
    const prevSessionId = process.env.FYLLO_SESSION_ID;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    process.env.FYLLO_MCP_EVENT_DIR = eventDir;
    delete process.env.FYLLO_SESSION_ID;
    try {
      const text = await createProposalTool({
        changeName: "missing-session-event",
        targetPath: root,
        workspaceMode: "main",
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      expect(state.changeName).toBe("missing-session-event");
      expect(existsSync(eventDir)).toBe(false);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
      restoreEnv("FYLLO_MCP_EVENT_DIR", prevEventDir);
      restoreEnv("FYLLO_SESSION_ID", prevSessionId);
    }
  });

  it("create-proposal does not fail when event write fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    const eventDir = join(root, "events-as-file");
    writeFileSync(eventDir, "not a directory", "utf8");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    const prevEventDir = process.env.FYLLO_MCP_EVENT_DIR;
    const prevSessionId = process.env.FYLLO_SESSION_ID;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    process.env.FYLLO_MCP_EVENT_DIR = eventDir;
    process.env.FYLLO_SESSION_ID = "session-1";
    try {
      const text = await createProposalTool({
        changeName: "write-failure-event",
        targetPath: root,
        workspaceMode: "main",
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      expect(state.changeName).toBe("write-failure-event");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
      restoreEnv("FYLLO_MCP_EVENT_DIR", prevEventDir);
      restoreEnv("FYLLO_SESSION_ID", prevSessionId);
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
    const root = createGitOpenspecFixture();
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await exploreTool({ targetPath: root, includeInstruction: false });
      const state = JSON.parse(text);
      expect(state.projectRoot).toBe(root);
      expect(state.activeChanges).toBeInstanceOf(Array);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
    }
  });

  it("explore accepts targetPath with trailing slash", async () => {
    const root = createGitOpenspecFixture();
    const prev = process.env.FYLLO_PROJECT_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    try {
      const text = await exploreTool({ targetPath: `${root}/`, includeInstruction: false });
      const state = JSON.parse(text);
      expect(state.projectRoot).toBe(root);
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

  it("explore returns linked worktree active changes from main repo root", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    initGitRepo(root);

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const changeName = "linked-explore-change";
      await createProposalTool({
        changeName,
        targetPath: root,
        workspaceMode: "linked",
        includeInstruction: false,
      });

      const text = await exploreTool({ targetPath: root, includeInstruction: false });
      const state = JSON.parse(text);
      const linkedPath = join(root, ".worktrees", changeName);
      const change = state.activeChanges.find((c: { name: string }) => c.name === changeName);
      expect(change).toBeDefined();
      expect(change.workspacePath).toBe(realpathSync.native(linkedPath));
      expect(change.workspaceMode).toBe("linked");
      expect(change).not.toHaveProperty("worktreePath");
      expect(state.warnings).toEqual([]);
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("explore returns main workspace active changes with main workspace metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    initGitRepo(root);

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const changeName = "main-explore-change";
      await createProposalTool({
        changeName,
        targetPath: root,
        workspaceMode: "main",
        includeInstruction: false,
      });

      const text = await exploreTool({ targetPath: root, includeInstruction: false });
      const state = JSON.parse(text);
      const change = state.activeChanges.find((c: { name: string }) => c.name === changeName);
      expect(change).toBeDefined();
      expect(change.workspacePath).toBe(realpathSync.native(root));
      expect(change.workspaceMode).toBe("main");
      expect(change).not.toHaveProperty("worktreePath");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("explore prefers linked worktree when main and linked share a change name", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    initGitRepo(root);

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const changeName = "dup-explore-change";
      await createProposalTool({
        changeName,
        targetPath: root,
        workspaceMode: "main",
        includeInstruction: false,
      });
      await createProposalTool({
        changeName,
        targetPath: root,
        workspaceMode: "linked",
        includeInstruction: false,
      });

      const text = await exploreTool({ targetPath: root, includeInstruction: false });
      const state = JSON.parse(text);
      const matches = state.activeChanges.filter((c: { name: string }) => c.name === changeName);
      expect(matches).toHaveLength(1);
      expect(matches[0].workspacePath).toBe(
        realpathSync.native(join(root, ".worktrees", changeName))
      );
      expect(matches[0].workspaceMode).toBe("linked");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("explore resolves currentChange from linked worktree when targetPath is main root", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n", "utf8");
    initGitRepo(root);

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const changeName = "linked-current-change";
      await createProposalTool({
        changeName,
        targetPath: root,
        workspaceMode: "linked",
        includeInstruction: false,
      });

      const text = await exploreTool({
        targetPath: root,
        changeName,
        includeInstruction: false,
      });
      const state = JSON.parse(text);
      expect(state.currentChange).toBeDefined();
      expect(state.currentChange.changeName).toBe(changeName);
      expect(state.currentChange.workspacePath).toBe(
        realpathSync.native(join(root, ".worktrees", changeName))
      );
      expect(state.currentChange.workspaceMode).toBe("linked");
      expect(state.currentChange).toHaveProperty("applyRequires");
      expect(state.currentChange).toHaveProperty("artifacts");
      expect(state.currentChange).toHaveProperty("schemaName");
      expect(state.currentChange).not.toHaveProperty("worktreePath");
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
    }
  });

  it("explore returns warnings and readable changes when one workspace list fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "fyllo-open-spec-"));
    initGitRepo(root);

    const prev = process.env.FYLLO_PROJECT_PATH;
    const prevCli = process.env.FYLLO_OPENSPEC_CLI_PATH;
    process.env.FYLLO_PROJECT_PATH = root;
    process.env.FYLLO_OPENSPEC_CLI_PATH = cliPath;
    try {
      const mainChangeName = "main-fine-change";
      await createProposalTool({
        changeName: mainChangeName,
        targetPath: root,
        workspaceMode: "main",
        includeInstruction: false,
      });

      const brokenWorktreePath = join(root, ".worktrees", "broken-no-openspec");
      git(root, ["worktree", "add", brokenWorktreePath]);

      const text = await exploreTool({ targetPath: root, includeInstruction: false });
      const state = JSON.parse(text);
      expect(state.activeChanges.map((c: { name: string }) => c.name)).toContain(mainChangeName);
      expect(state.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining(brokenWorktreePath)])
      );
    } finally {
      restoreEnv("FYLLO_PROJECT_PATH", prev);
      restoreEnv("FYLLO_OPENSPEC_CLI_PATH", prevCli);
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
        commitMessage: "chore(specs): add test-archive design and tasks",
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
        commitMessage: "chore(specs): update test-cap specification",
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

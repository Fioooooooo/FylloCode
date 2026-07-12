import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { GuidelineEntry } from "../../../src/mcp-servers/fyllo-cortex/src/types/guideline";
import { registerTools } from "../../../src/mcp-servers/fyllo-cortex/src/tools";
import {
  serializeKnowledgeEntry,
  sha256,
} from "../../../src/mcp-servers/fyllo-cortex/src/utils/knowledge";
import type { KnowledgeEntryDraft } from "../../../src/shared/types/knowledge";

async function createToolClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const server = new McpServer({ name: "fyllo-cortex-test", version: "1.0.0" });
  registerTools(server);
  const client = new Client({ name: "fyllo-cortex-client", version: "1.0.0" });
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

async function callGuidelines(
  client: Client,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  return client.request(
    { method: "tools/call", params: { name: "guidelines", arguments: args } },
    CallToolResultSchema
  );
}

async function callLineage(client: Client, args: Record<string, unknown>): Promise<CallToolResult> {
  return client.request(
    { method: "tools/call", params: { name: "lineage", arguments: args } },
    CallToolResultSchema
  );
}

async function callKnowledge(
  client: Client,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  return client.request(
    { method: "tools/call", params: { name: "knowledge", arguments: args } },
    CallToolResultSchema
  );
}

async function expectLineageCallToFail(
  client: Client,
  args: Record<string, unknown>
): Promise<void> {
  try {
    const result = await callLineage(client, args);
    expect(result.isError).toBe(true);
  } catch (error) {
    expect(error).toBeTruthy();
  }
}

async function expectKnowledgeCallToFail(
  client: Client,
  args: Record<string, unknown>
): Promise<void> {
  try {
    const result = await callKnowledge(client, args);
    expect(result.isError).toBe(true);
  } catch (error) {
    expect(error).toBeTruthy();
  }
}

async function expectGuidelinesCallToFail(
  client: Client,
  args: Record<string, unknown>
): Promise<void> {
  try {
    const result = await callGuidelines(client, args);
    expect(result.isError).toBe(true);
  } catch (error) {
    expect(error).toBeTruthy();
  }
}

function expectTextContent(result: CallToolResult): string {
  expect(result.isError).not.toBe(true);
  expect(result.content).toHaveLength(1);
  const content = result.content[0];
  expect(content?.type).toBe("text");
  if (content?.type !== "text") {
    throw new Error("Expected response to return text content");
  }

  return content.text;
}

type GuidelinesState = {
  mode?: string;
  guidelinesRoot?: string;
  reason?: string;
  topic?: string;
  guidelines?: GuidelineEntry[];
  agentsFile?: { path: string; exists: boolean; hasGuidelinesIndex: boolean };
  target?: {
    path: string;
    exists: boolean;
    name: string | null;
    description: string | null;
    keywords: string[] | null;
    parseError?: string;
  };
  errors?: Array<{ type: string; message: string }>;
};

function parseGuidelinesState(text: string): GuidelinesState {
  const match = /<state>\n([\s\S]*?)\n<\/state>/.exec(text);
  return JSON.parse(match ? (match[1] ?? "") : text) as GuidelinesState;
}

type KnowledgeState = {
  mode?: string;
  knowledgeRoot?: string;
  reason?: string;
  index?: {
    entries: Array<{
      name: string;
      description: string;
      type: string;
      path: string;
      status: string;
      contentHash: string;
    }>;
    errors: Array<{ path: string; type: string; message: string }>;
  };
  target?: {
    name: string;
    exists: boolean;
    path?: string;
    content?: string;
    contentHash?: string;
    status?: string;
    parseError?: string;
  };
  approximateRenderedIndexTokens?: number;
  errors?: Array<{ type: string; message: string }>;
};

function parseKnowledgeState(text: string): KnowledgeState {
  const match = /<state>\n([\s\S]*?)\n<\/state>/.exec(text);
  return JSON.parse(match ? (match[1] ?? "") : text) as KnowledgeState;
}

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function makeKnowledgeEntry(overrides: Partial<KnowledgeEntryDraft> = {}): KnowledgeEntryDraft {
  return {
    name: "renderer-theme-subscription",
    description: "Read before changing renderer markdown theme subscriptions",
    type: "project",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    source: {
      kind: "session",
      sessionId: "session-1",
      actionId: "chat:session-1:0:0:0",
    },
    body: "Theme subscriptions should stay outside leaf markdown instances.",
    ...overrides,
  };
}

async function writeKnowledgeFixture(dataDir: string, entry: KnowledgeEntryDraft): Promise<string> {
  const root = join(dataDir, "knowledge");
  await mkdir(root, { recursive: true });
  const content = serializeKnowledgeEntry(entry);
  await writeFile(join(root, `${entry.name}.md`), content, "utf8");
  return content;
}

// ── Helpers for lineage fixtures ────────────────────────────────────────────

async function createLineageFixture(
  dataDir: string,
  index: {
    proposals?: Record<string, string>;
    commitHashes?: Record<string, string>;
  },
  subjects: Array<{ id: string; content: unknown }>
): Promise<void> {
  const lineageDir = join(dataDir, "lineage");
  const subjectsDir = join(lineageDir, "subjects");
  await mkdir(subjectsDir, { recursive: true });

  await writeFile(
    join(lineageDir, "index.json"),
    JSON.stringify({
      version: 1,
      tasks: {},
      sessions: {},
      proposals: index.proposals ?? {},
      commitHashes: index.commitHashes ?? {},
      updatedAt: "2026-06-16T00:00:00.000Z",
    })
  );

  for (const subject of subjects) {
    await writeFile(join(subjectsDir, `${subject.id}.json`), JSON.stringify(subject.content));
  }
}

function makeSubject(options: {
  id: string;
  origin: "task" | "chat";
  task?: {
    ref: string;
    snapshot: {
      id: string;
      projectId: string;
      title: string;
      description: { format: string; content: string };
      status: string;
      source: string;
      sourceMeta: { source: string; url?: string };
      labels: [];
      createdAt: string;
      updatedAt: string;
    };
    capturedAt: string;
  } | null;
  links: Array<{
    sessionId: string;
    createdAt: string;
    proposals: Array<{
      changeId: string;
      createdAt: string;
      commitHash?: string;
    }>;
    plans?: Array<{
      slug: string;
      createdAt: string;
    }>;
  }>;
}): unknown {
  return {
    id: options.id,
    origin: options.origin,
    task: options.task ?? null,
    links: options.links,
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:01:00.000Z",
  };
}

// ── Git helpers ────────────────────────────────────────────────────────────

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@test",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@test",
    },
  });
}

async function initGitRepo(dir: string): Promise<void> {
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "test"]);
  git(dir, ["config", "user.email", "test@test"]);
}

async function gitCommitFile(
  dir: string,
  relativePath: string,
  content: string,
  message: string
): Promise<string> {
  const fullPath = join(dir, relativePath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content);
  git(dir, ["add", relativePath]);
  git(dir, ["commit", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]).trim();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("fyllo-cortex tools", () => {
  describe("tools/list", () => {
    it("lists guidelines, knowledge, and lineage tools", async () => {
      const { client, close } = await createToolClient();
      try {
        const result = await client.request(
          { method: "tools/list", params: {} },
          ListToolsResultSchema
        );

        expect(result.tools).toHaveLength(3);
        const names = result.tools.map((t) => t.name).sort();
        expect(names).toEqual(["guidelines", "knowledge", "lineage"]);

        const guidelinesTool = result.tools.find((t) => t.name === "guidelines");
        expect(guidelinesTool?.inputSchema).toMatchObject({
          type: "object",
          properties: {
            mode: {
              enum: ["init", "create", "update"],
            },
          },
          required: ["mode"],
          additionalProperties: false,
        });

        const lineageTool = result.tools.find((t) => t.name === "lineage");
        expect(lineageTool?.inputSchema).toMatchObject({
          type: "object",
          properties: {
            mode: {
              enum: ["trace-proposal", "trace-commit", "trace-file"],
            },
          },
          required: ["mode"],
          additionalProperties: false,
        });

        const knowledgeTool = result.tools.find((t) => t.name === "knowledge");
        expect(knowledgeTool?.inputSchema).toMatchObject({
          type: "object",
          properties: {
            mode: {
              enum: ["capture", "update", "retire", "audit"],
            },
          },
          required: ["mode"],
          additionalProperties: false,
        });
      } finally {
        await close();
      }
    });
  });

  describe("knowledge tool", () => {
    let originalDataDir: string | undefined;
    let originalProjectPath: string | undefined;
    let tmpDataDir: string;
    let tmpProjectPath: string;

    beforeEach(async () => {
      originalDataDir = process.env.FYLLO_PROJECT_DATA_DIR;
      originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      tmpDataDir = await mkdtemp(join(tmpdir(), "fyllo-knowledge-data-"));
      tmpProjectPath = await mkdtemp(join(tmpdir(), "fyllo-knowledge-project-"));
      process.env.FYLLO_PROJECT_DATA_DIR = tmpDataDir;
      process.env.FYLLO_PROJECT_PATH = tmpProjectPath;
    });

    afterEach(async () => {
      process.env.FYLLO_PROJECT_DATA_DIR = originalDataDir;
      process.env.FYLLO_PROJECT_PATH = originalProjectPath;
      await rm(tmpDataDir, { recursive: true, force: true });
      await rm(tmpProjectPath, { recursive: true, force: true });
    });

    it("returns tool_instruction and state for mode=capture", async () => {
      const { client, close } = await createToolClient();
      try {
        const content = await writeKnowledgeFixture(tmpDataDir, makeKnowledgeEntry());
        const result = await callKnowledge(client, { mode: "capture" });
        const text = expectTextContent(result);

        expect(text).toContain("<tool_instruction>");
        expect(text).toContain("<state>");
        expect(text).toContain("Write each accepted entry directly");
        expect(text).toContain('{"name":"<name>"');
        const state = parseKnowledgeState(text);
        expect(state.mode).toBe("capture");
        expect(state.knowledgeRoot).toBe(join(tmpDataDir, "knowledge"));
        expect(state.index?.entries).toHaveLength(1);
        expect(state.index?.entries[0]).toMatchObject({
          name: "renderer-theme-subscription",
          description: "Read before changing renderer markdown theme subscriptions",
          type: "project",
          path: "renderer-theme-subscription.md",
          status: "active",
          contentHash: sha256(content),
        });
      } finally {
        await close();
      }
    });

    it("instructs agents to write markdown before emitting name-based review actions", async () => {
      const { client, close } = await createToolClient();
      try {
        await writeKnowledgeFixture(tmpDataDir, makeKnowledgeEntry());

        const capture = expectTextContent(await callKnowledge(client, { mode: "capture" }));
        expect(capture).toContain("Write each accepted entry directly");
        expect(capture).toContain('{"name":"<name>"');
        expect(capture).not.toContain("capture` items");

        const update = expectTextContent(
          await callKnowledge(client, {
            mode: "update",
            name: "renderer-theme-subscription",
            reason: "stale evidence",
          })
        );
        expect(update).toContain("revise the full markdown directly on disk");
        expect(update).toContain('{"name":"<name>"');
        expect(update).not.toContain("expectedContentHash");

        const retire = expectTextContent(
          await callKnowledge(client, {
            mode: "retire",
            name: "renderer-theme-subscription",
            reason: "obsolete evidence",
          })
        );
        expect(retire).toContain("Delete the target file");
        expect(retire).not.toContain("retire` item");
      } finally {
        await close();
      }
    });

    it("omits instruction when includeInstruction is false", async () => {
      const { client, close } = await createToolClient();
      try {
        const result = await callKnowledge(client, {
          mode: "capture",
          includeInstruction: false,
        });
        const text = expectTextContent(result);

        expect(text).not.toContain("<tool_instruction>");
        expect(parseKnowledgeState(text)).toMatchObject({
          mode: "capture",
          knowledgeRoot: join(tmpDataDir, "knowledge"),
          index: { entries: [], errors: [] },
        });
      } finally {
        await close();
      }
    });

    it("returns target content for mode=update and mode=retire", async () => {
      const { client, close } = await createToolClient();
      try {
        const content = await writeKnowledgeFixture(tmpDataDir, makeKnowledgeEntry());

        for (const mode of ["update", "retire"] as const) {
          const result = await callKnowledge(client, {
            mode,
            name: "renderer-theme-subscription",
            reason: "stale implementation evidence",
            includeInstruction: false,
          });
          const state = parseKnowledgeState(expectTextContent(result));

          expect(state.reason).toBe("stale implementation evidence");
          expect(state.target).toMatchObject({
            name: "renderer-theme-subscription",
            exists: true,
            path: "renderer-theme-subscription.md",
            content,
            contentHash: sha256(content),
            status: "active",
          });
        }
      } finally {
        await close();
      }
    });

    it("returns missing target and parse errors", async () => {
      const { client, close } = await createToolClient();
      try {
        const root = join(tmpDataDir, "knowledge");
        await mkdir(root, { recursive: true });
        await writeFile(join(root, "broken-entry.md"), "---\nname: [\n---\nbody", "utf8");

        const missing = await callKnowledge(client, {
          mode: "update",
          name: "missing-entry",
          reason: "check missing",
          includeInstruction: false,
        });
        expect(parseKnowledgeState(expectTextContent(missing)).target).toEqual({
          name: "missing-entry",
          exists: false,
        });

        const broken = await callKnowledge(client, {
          mode: "update",
          name: "broken-entry",
          reason: "repair parse error",
          includeInstruction: false,
        });
        expect(parseKnowledgeState(expectTextContent(broken)).target).toMatchObject({
          name: "broken-entry",
          exists: true,
          path: "broken-entry.md",
          parseError: expect.any(String),
        });
      } finally {
        await close();
      }
    });

    it("audit returns index status and approximate rendered token count", async () => {
      const { client, close } = await createToolClient();
      try {
        await mkdir(join(tmpProjectPath, "src"), { recursive: true });
        await writeFile(join(tmpProjectPath, "src", "example.ts"), "export const value = 1;\n");
        await writeKnowledgeFixture(
          tmpDataDir,
          makeKnowledgeEntry({
            anchors: [
              {
                kind: "file",
                file: "src/example.ts",
                hash: "b".repeat(64),
              },
            ],
            source: undefined,
          })
        );

        const result = await callKnowledge(client, {
          mode: "audit",
          includeInstruction: false,
        });
        const state = parseKnowledgeState(expectTextContent(result));

        expect(state.mode).toBe("audit");
        expect(state.index?.entries[0]).toMatchObject({
          name: "renderer-theme-subscription",
          status: "suspect",
        });
        expect(state.approximateRenderedIndexTokens).toEqual(expect.any(Number));
        expect(state.approximateRenderedIndexTokens ?? 0).toBeGreaterThan(0);
      } finally {
        await close();
      }
    });

    it("validates mode-specific required fields", async () => {
      const { client, close } = await createToolClient();
      try {
        await expectKnowledgeCallToFail(client, { mode: "update", name: "entry" });
        await expectKnowledgeCallToFail(client, { mode: "retire", reason: "stale" });
        await expectKnowledgeCallToFail(client, { mode: "capture", unexpected: true });
      } finally {
        await close();
      }
    });
  });

  describe("guidelines tool", () => {
    it("returns tool_instruction and state for mode=init", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const { client, close } = await createToolClient();

      try {
        process.env.FYLLO_PROJECT_PATH = tmpDir;
        const result = await callGuidelines(client, { mode: "init" });
        const text = expectTextContent(result);

        expect(text).toContain("<tool_instruction>");
        expect(text).toContain("<state>");

        const state = parseGuidelinesState(text);
        expect(state.mode).toBe("init");
        expect(state.guidelinesRoot).toBe("guidelines");
        expect(state.guidelines).toEqual([]);
        expect(state.agentsFile).toEqual({
          path: "AGENTS.md",
          exists: false,
          hasGuidelinesIndex: false,
        });
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("omits the instruction when includeInstruction is false", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const { client, close } = await createToolClient();

      try {
        process.env.FYLLO_PROJECT_PATH = tmpDir;
        const result = await callGuidelines(client, { mode: "init", includeInstruction: false });
        const text = expectTextContent(result);

        expect(text).not.toContain("<tool_instruction>");
        expect(parseGuidelinesState(text).mode).toBe("init");
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("fails when mode=create lacks topic", async () => {
      const { client, close } = await createToolClient();
      try {
        await expectGuidelinesCallToFail(client, { mode: "create" });
      } finally {
        await close();
      }
    });

    it("fails when mode=update lacks path", async () => {
      const { client, close } = await createToolClient();
      try {
        await expectGuidelinesCallToFail(client, { mode: "update" });
      } finally {
        await close();
      }
    });

    it("fails when mode is missing", async () => {
      const { client, close } = await createToolClient();
      try {
        await expectGuidelinesCallToFail(client, {});
      } finally {
        await close();
      }
    });

    it("returns guideline entries in create state", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const guidelinesDir = join(tmpDir, "guidelines");
      const frontendDir = join(guidelinesDir, "frontend");
      const { client, close } = await createToolClient();

      try {
        await mkdir(frontendDir, { recursive: true });
        await writeFile(
          join(guidelinesDir, "A.md"),
          [
            "---",
            'name: "Architecture"',
            'description: "x"',
            'keywords: ["a", "b"]',
            "---",
            "# Architecture",
          ].join("\n")
        );
        await writeFile(join(guidelinesDir, "B.md"), "# Legacy\n");
        await writeFile(join(guidelinesDir, "Bad.md"), "---\n: : :\n---\n# Bad\n");
        await writeFile(
          join(frontendDir, "Routing.md"),
          [
            "---",
            'name: "Routing"',
            'description: "routes"',
            'keywords: ["frontend"]',
            "---",
            "# Routing",
          ].join("\n")
        );

        process.env.FYLLO_PROJECT_PATH = tmpDir;
        const result = await callGuidelines(client, {
          mode: "create",
          topic: "Routing",
          includeInstruction: false,
        });
        const payload = parseGuidelinesState(expectTextContent(result));
        expect(payload.topic).toBe("Routing");
        const paths = (payload.guidelines ?? []).map((entry) => entry.path);

        expect(paths).toEqual([...paths].sort());
        expect(paths).toContain("guidelines/frontend/Routing.md");

        const byPath = new Map((payload.guidelines ?? []).map((entry) => [entry.path, entry]));
        expect(byPath.get("guidelines/A.md")).toMatchObject({
          path: "guidelines/A.md",
          name: "Architecture",
          description: "x",
          keywords: ["a", "b"],
        });
        expect(byPath.get("guidelines/B.md")).toEqual({
          path: "guidelines/B.md",
          name: "B",
          description: null,
          keywords: null,
        });
        expect(byPath.get("guidelines/Bad.md")?.parseError).toEqual(expect.any(String));
        expect(byPath.get("guidelines/Bad.md")?.parseError).not.toBe("");
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns empty guidelines when the directory is missing", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const { client, close } = await createToolClient();

      try {
        process.env.FYLLO_PROJECT_PATH = tmpDir;
        const result = await callGuidelines(client, { mode: "init", includeInstruction: false });
        expect(parseGuidelinesState(expectTextContent(result)).guidelines).toEqual([]);
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("parses frontmatter in files with a UTF-8 BOM", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const guidelinesDir = join(tmpDir, "guidelines");
      const { client, close } = await createToolClient();

      try {
        await mkdir(guidelinesDir, { recursive: true });
        await writeFile(
          join(guidelinesDir, "Bom.md"),
          "\uFEFF" + ["---", 'name: "Bom"', 'description: "bom"', "---", "# Bom"].join("\n")
        );

        process.env.FYLLO_PROJECT_PATH = tmpDir;
        const result = await callGuidelines(client, { mode: "init", includeInstruction: false });
        const payload = parseGuidelinesState(expectTextContent(result));

        expect(payload.guidelines).toHaveLength(1);
        expect(payload.guidelines?.[0]).toMatchObject({
          path: "guidelines/Bom.md",
          name: "Bom",
          description: "bom",
        });
        expect(payload.guidelines?.[0]?.parseError).toBeUndefined();
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
      "reports unreadable files without failing the scan",
      async () => {
        const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
        const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
        const guidelinesDir = join(tmpDir, "guidelines");
        const lockedPath = join(guidelinesDir, "Locked.md");
        const { client, close } = await createToolClient();

        try {
          await mkdir(guidelinesDir, { recursive: true });
          await writeFile(join(guidelinesDir, "Ok.md"), "# Ok\n");
          await writeFile(lockedPath, "# Locked\n");
          await chmod(lockedPath, 0o000);

          process.env.FYLLO_PROJECT_PATH = tmpDir;
          const result = await callGuidelines(client, { mode: "init", includeInstruction: false });
          const payload = parseGuidelinesState(expectTextContent(result));

          const byPath = new Map((payload.guidelines ?? []).map((entry) => [entry.path, entry]));
          expect(byPath.get("guidelines/Ok.md")).toEqual({
            path: "guidelines/Ok.md",
            name: "Ok",
            description: null,
            keywords: null,
          });
          expect(byPath.get("guidelines/Locked.md")).toMatchObject({
            path: "guidelines/Locked.md",
            name: "Locked",
            description: null,
            keywords: null,
            parseError: expect.any(String),
          });
        } finally {
          setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
          await chmod(lockedPath, 0o644).catch(() => {});
          await close();
          await rm(tmpDir, { recursive: true, force: true });
        }
      }
    );

    it("detects an existing AGENTS.md guidelines index", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const { client, close } = await createToolClient();

      try {
        process.env.FYLLO_PROJECT_PATH = tmpDir;

        await writeFile(join(tmpDir, "AGENTS.md"), "# Project\n\nNo index yet.\n");
        let result = await callGuidelines(client, { mode: "init", includeInstruction: false });
        expect(parseGuidelinesState(expectTextContent(result)).agentsFile).toEqual({
          path: "AGENTS.md",
          exists: true,
          hasGuidelinesIndex: false,
        });

        await writeFile(
          join(tmpDir, "AGENTS.md"),
          "# Project\n\n## Project Guidelines Index\n\n- **Testing** - [Testing](guidelines/Testing.md)\n"
        );
        result = await callGuidelines(client, { mode: "init", includeInstruction: false });
        expect(parseGuidelinesState(expectTextContent(result)).agentsFile).toEqual({
          path: "AGENTS.md",
          exists: true,
          hasGuidelinesIndex: true,
        });
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns target frontmatter for mode=update", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const guidelinesDir = join(tmpDir, "guidelines");
      const { client, close } = await createToolClient();

      try {
        await mkdir(guidelinesDir, { recursive: true });
        await writeFile(
          join(guidelinesDir, "Testing.md"),
          [
            "---",
            'name: "Testing"',
            'description: "test rules"',
            'keywords: ["vitest"]',
            "---",
            "# Testing",
          ].join("\n")
        );

        process.env.FYLLO_PROJECT_PATH = tmpDir;
        const result = await callGuidelines(client, {
          mode: "update",
          path: "guidelines/Testing.md",
          reason: "stale verification commands",
          includeInstruction: false,
        });
        const state = parseGuidelinesState(expectTextContent(result));

        expect(state.reason).toBe("stale verification commands");
        expect(state.target).toEqual({
          path: "guidelines/Testing.md",
          exists: true,
          name: "Testing",
          description: "test rules",
          keywords: ["vitest"],
        });
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("reports a missing update target", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const { client, close } = await createToolClient();

      try {
        process.env.FYLLO_PROJECT_PATH = tmpDir;
        const result = await callGuidelines(client, {
          mode: "update",
          path: "guidelines/Nope.md",
          includeInstruction: false,
        });
        const state = parseGuidelinesState(expectTextContent(result));

        expect(state.target).toEqual({
          path: "guidelines/Nope.md",
          exists: false,
          name: null,
          description: null,
          keywords: null,
        });
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("rejects update paths outside guidelines/", async () => {
      const originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const { client, close } = await createToolClient();

      try {
        process.env.FYLLO_PROJECT_PATH = tmpDir;
        for (const badPath of ["../secrets.md", "guidelines/../package.json", "src/notes.md"]) {
          const result = await callGuidelines(client, {
            mode: "update",
            path: badPath,
            includeInstruction: false,
          });
          const state = parseGuidelinesState(expectTextContent(result));
          expect(state.errors?.[0]?.type).toBe("InvalidTargetPath");
        }
      } finally {
        setEnv("FYLLO_PROJECT_PATH", originalProjectPath);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("lineage tool", () => {
    let originalDataDir: string | undefined;
    let originalProjectPath: string | undefined;
    let tmpDataDir: string;
    let tmpProjectPath: string;

    beforeEach(async () => {
      originalDataDir = process.env.FYLLO_PROJECT_DATA_DIR;
      originalProjectPath = process.env.FYLLO_PROJECT_PATH;
      tmpDataDir = await mkdtemp(join(tmpdir(), "fyllo-lineage-data-"));
      tmpProjectPath = await mkdtemp(join(tmpdir(), "fyllo-lineage-project-"));
      process.env.FYLLO_PROJECT_DATA_DIR = tmpDataDir;
      process.env.FYLLO_PROJECT_PATH = tmpProjectPath;
    });

    afterEach(async () => {
      process.env.FYLLO_PROJECT_DATA_DIR = originalDataDir;
      process.env.FYLLO_PROJECT_PATH = originalProjectPath;
      await rm(tmpDataDir, { recursive: true, force: true });
      await rm(tmpProjectPath, { recursive: true, force: true });
    });

    it("rejects extra fields in input", async () => {
      const { client, close } = await createToolClient();
      try {
        await expectLineageCallToFail(client, {
          mode: "trace-proposal",
          changeId: "add-foo",
          targetPath: "/repo",
        });
      } finally {
        await close();
      }
    });

    it("trace-proposal returns subject DTO with task summary and pending status", async () => {
      const { client, close } = await createToolClient();
      try {
        const changeDir = join(tmpProjectPath, "openspec", "changes", "add-foo");
        await mkdir(changeDir, { recursive: true });
        await writeFile(join(changeDir, ".openspec.yaml"), "status: creating\n");

        await createLineageFixture(tmpDataDir, { proposals: { "add-foo": "subject-1" } }, [
          {
            id: "subject-1",
            content: makeSubject({
              id: "subject-1",
              origin: "task",
              task: {
                ref: "github:42",
                snapshot: {
                  id: "task-1",
                  projectId: "proj-1",
                  title: "Task title",
                  description: { format: "markdown", content: "Task description" },
                  status: "open",
                  source: "github",
                  sourceMeta: { source: "github", url: "https://example.test/task/42" },
                  labels: [],
                  createdAt: "2026-06-15T00:00:00.000Z",
                  updatedAt: "2026-06-15T00:00:00.000Z",
                },
                capturedAt: "2026-06-16T00:00:00.000Z",
              },
              links: [
                {
                  sessionId: "sess-1",
                  createdAt: "2026-06-16T00:00:00.000Z",
                  proposals: [
                    {
                      changeId: "add-foo",
                      createdAt: "2026-06-16T00:01:00.000Z",
                    },
                  ],
                },
              ],
            }),
          },
        ]);

        const result = await callLineage(client, { mode: "trace-proposal", changeId: "add-foo" });
        const text = expectTextContent(result);
        const dto = JSON.parse(text);

        expect(dto.subjectId).toBe("subject-1");
        expect(dto.origin).toBe("task");
        expect(dto.task).toEqual({
          ref: "github:42",
          title: "Task title",
          description: "Task description",
          source: "github",
          url: "https://example.test/task/42",
        });
        expect(dto.sessions).toHaveLength(1);
        expect(dto.sessions[0].sessionId).toBe("sess-1");
        expect(dto.sessions[0].plans).toEqual([]);
        expect(dto.sessions[0].proposals).toHaveLength(1);
        expect(dto.sessions[0].proposals[0]).toMatchObject({
          changeId: "add-foo",
          commitHash: null,
          status: "pending",
          proposalPath: expect.stringMatching(/\/openspec\/changes\/add-foo$/),
        });
        expect(dto.createdAt).toBe("2026-06-16T00:00:00.000Z");
        expect(dto.updatedAt).toBe("2026-06-16T00:01:00.000Z");
      } finally {
        await close();
      }
    });

    it("trace-commit returns subject with completed status when commitHash present", async () => {
      const { client, close } = await createToolClient();
      try {
        const fullHash = "abcdef1234567890abcdef1234567890abcdef12";
        const archiveChangeDir = join(tmpProjectPath, "openspec", "changes", "archive", "add-foo");
        await mkdir(archiveChangeDir, { recursive: true });
        await writeFile(join(archiveChangeDir, ".openspec.yaml"), "status: archived\n");

        await createLineageFixture(
          tmpDataDir,
          {
            proposals: { "add-foo": "subject-1" },
            commitHashes: { [fullHash]: "subject-1" },
          },
          [
            {
              id: "subject-1",
              content: makeSubject({
                id: "subject-1",
                origin: "task",
                task: {
                  ref: "github:42",
                  snapshot: {
                    id: "task-1",
                    projectId: "proj-1",
                    title: "Task title",
                    description: { format: "markdown", content: "Task description" },
                    status: "open",
                    source: "github",
                    sourceMeta: { source: "github" },
                    labels: [],
                    createdAt: "2026-06-15T00:00:00.000Z",
                    updatedAt: "2026-06-15T00:00:00.000Z",
                  },
                  capturedAt: "2026-06-16T00:00:00.000Z",
                },
                links: [
                  {
                    sessionId: "sess-1",
                    createdAt: "2026-06-16T00:00:00.000Z",
                    proposals: [
                      {
                        changeId: "add-foo",
                        createdAt: "2026-06-16T00:01:00.000Z",
                        commitHash: fullHash,
                      },
                    ],
                  },
                ],
              }),
            },
          ]
        );

        const result = await callLineage(client, { mode: "trace-commit", commitHash: fullHash });
        const text = expectTextContent(result);
        const dto = JSON.parse(text);

        expect(dto.subjectId).toBe("subject-1");
        expect(dto.sessions[0].proposals[0].commitHash).toBe(fullHash);
        expect(dto.sessions[0].proposals[0].status).toBe("completed");
      } finally {
        await close();
      }
    });

    it("returns task null for chat origin subject", async () => {
      const { client, close } = await createToolClient();
      try {
        await createLineageFixture(tmpDataDir, { proposals: { "add-foo": "subject-1" } }, [
          {
            id: "subject-1",
            content: makeSubject({
              id: "subject-1",
              origin: "chat",
              task: null,
              links: [
                {
                  sessionId: "sess-1",
                  createdAt: "2026-06-16T00:00:00.000Z",
                  proposals: [
                    {
                      changeId: "add-foo",
                      createdAt: "2026-06-16T00:01:00.000Z",
                    },
                  ],
                },
              ],
            }),
          },
        ]);

        const result = await callLineage(client, { mode: "trace-proposal", changeId: "add-foo" });
        const text = expectTextContent(result);
        const dto = JSON.parse(text);

        expect(dto.origin).toBe("chat");
        expect(dto.task).toBeNull();
      } finally {
        await close();
      }
    });

    it("returns applying status when active change has status: applying", async () => {
      const { client, close } = await createToolClient();
      try {
        const changeDir = join(tmpProjectPath, "openspec", "changes", "add-foo");
        await mkdir(changeDir, { recursive: true });
        await writeFile(join(changeDir, ".openspec.yaml"), "status: applying\n");

        await createLineageFixture(tmpDataDir, { proposals: { "add-foo": "subject-1" } }, [
          {
            id: "subject-1",
            content: makeSubject({
              id: "subject-1",
              origin: "task",
              task: {
                ref: "local:1",
                snapshot: {
                  id: "task-1",
                  projectId: "proj-1",
                  title: "Task title",
                  description: { format: "markdown", content: "Desc" },
                  status: "open",
                  source: "local",
                  sourceMeta: { source: "local" },
                  labels: [],
                  createdAt: "2026-06-15T00:00:00.000Z",
                  updatedAt: "2026-06-15T00:00:00.000Z",
                },
                capturedAt: "2026-06-16T00:00:00.000Z",
              },
              links: [
                {
                  sessionId: "sess-1",
                  createdAt: "2026-06-16T00:00:00.000Z",
                  proposals: [
                    {
                      changeId: "add-foo",
                      createdAt: "2026-06-16T00:01:00.000Z",
                    },
                  ],
                },
              ],
            }),
          },
        ]);

        const result = await callLineage(client, { mode: "trace-proposal", changeId: "add-foo" });
        const text = expectTextContent(result);
        const dto = JSON.parse(text);

        expect(dto.sessions[0].proposals[0].status).toBe("applying");
      } finally {
        await close();
      }
    });

    it("returns null when index.json is missing", async () => {
      const { client, close } = await createToolClient();
      try {
        const result = await callLineage(client, { mode: "trace-proposal", changeId: "add-foo" });
        const text = expectTextContent(result);
        expect(text).toBe("null");
      } finally {
        await close();
      }
    });

    it("returns null when index has no matching key", async () => {
      const { client, close } = await createToolClient();
      try {
        await createLineageFixture(tmpDataDir, { proposals: { "add-bar": "subject-1" } }, []);

        const result = await callLineage(client, { mode: "trace-proposal", changeId: "add-foo" });
        const text = expectTextContent(result);
        expect(text).toBe("null");
      } finally {
        await close();
      }
    });

    it("returns null when subject file is missing", async () => {
      const { client, close } = await createToolClient();
      try {
        await createLineageFixture(tmpDataDir, { proposals: { "add-foo": "subject-missing" } }, []);

        const result = await callLineage(client, { mode: "trace-proposal", changeId: "add-foo" });
        const text = expectTextContent(result);
        expect(text).toBe("null");
      } finally {
        await close();
      }
    });

    it("does not scan subjects directory when index is missing", async () => {
      const { client, close } = await createToolClient();
      try {
        // Create a subject file directly without index
        const subjectsDir = join(tmpDataDir, "lineage", "subjects");
        await mkdir(subjectsDir, { recursive: true });
        await writeFile(
          join(subjectsDir, "subject-1.json"),
          JSON.stringify(
            makeSubject({
              id: "subject-1",
              origin: "task",
              task: null,
              links: [],
            })
          )
        );

        const result = await callLineage(client, { mode: "trace-proposal", changeId: "add-foo" });
        const text = expectTextContent(result);
        expect(text).toBe("null");
      } finally {
        await close();
      }
    });

    it("trace-file returns matching subjects for commits in lineage index", async () => {
      const { client, close } = await createToolClient();
      try {
        await initGitRepo(tmpProjectPath);
        const hash1 = await gitCommitFile(tmpProjectPath, "src/foo.ts", "v1", "first");
        await gitCommitFile(tmpProjectPath, "src/foo.ts", "v2", "second");
        const hash3 = await gitCommitFile(tmpProjectPath, "src/foo.ts", "v3", "third");

        await createLineageFixture(
          tmpDataDir,
          { commitHashes: { [hash1]: "subject-1", [hash3]: "subject-2" } },
          [
            {
              id: "subject-1",
              content: makeSubject({
                id: "subject-1",
                origin: "task",
                task: null,
                links: [
                  {
                    sessionId: "sess-1",
                    createdAt: "2026-06-16T00:00:00.000Z",
                    proposals: [
                      {
                        changeId: "change-a",
                        createdAt: "2026-06-16T00:01:00.000Z",
                        commitHash: hash1,
                      },
                    ],
                  },
                ],
              }),
            },
            {
              id: "subject-2",
              content: makeSubject({
                id: "subject-2",
                origin: "chat",
                task: null,
                links: [
                  {
                    sessionId: "sess-2",
                    createdAt: "2026-06-16T00:02:00.000Z",
                    proposals: [
                      {
                        changeId: "change-b",
                        createdAt: "2026-06-16T00:03:00.000Z",
                        commitHash: hash3,
                      },
                    ],
                  },
                ],
              }),
            },
          ]
        );

        const result = await callLineage(client, { mode: "trace-file", filePath: "src/foo.ts" });
        const text = expectTextContent(result);
        const dto = JSON.parse(text) as Array<{ subjectId: string }>;

        expect(dto).toHaveLength(2);
        const subjectIds = dto.map((d) => d.subjectId).sort();
        expect(subjectIds).toEqual(["subject-1", "subject-2"]);
      } finally {
        await close();
      }
    });

    it("trace-file returns empty array when no commits match lineage index", async () => {
      const { client, close } = await createToolClient();
      try {
        await initGitRepo(tmpProjectPath);
        await gitCommitFile(tmpProjectPath, "src/bar.ts", "content", "untracked commit");

        await createLineageFixture(tmpDataDir, { commitHashes: {} }, []);

        const result = await callLineage(client, { mode: "trace-file", filePath: "src/bar.ts" });
        const text = expectTextContent(result);
        const dto = JSON.parse(text) as unknown[];

        expect(dto).toEqual([]);
      } finally {
        await close();
      }
    });

    it("trace-file returns empty array when file has no commits", async () => {
      const { client, close } = await createToolClient();
      try {
        await initGitRepo(tmpProjectPath);
        await gitCommitFile(tmpProjectPath, "src/other.ts", "x", "init");

        const result = await callLineage(client, {
          mode: "trace-file",
          filePath: "src/nonexistent.ts",
        });
        const text = expectTextContent(result);
        const dto = JSON.parse(text) as unknown[];

        expect(dto).toEqual([]);
      } finally {
        await close();
      }
    });

    it("trace-file deduplicates subjects when multiple commits map to same subject", async () => {
      const { client, close } = await createToolClient();
      try {
        await initGitRepo(tmpProjectPath);
        const hash1 = await gitCommitFile(tmpProjectPath, "src/dup.ts", "v1", "first");
        const hash2 = await gitCommitFile(tmpProjectPath, "src/dup.ts", "v2", "second");

        await createLineageFixture(
          tmpDataDir,
          { commitHashes: { [hash1]: "subject-1", [hash2]: "subject-1" } },
          [
            {
              id: "subject-1",
              content: makeSubject({
                id: "subject-1",
                origin: "chat",
                task: null,
                links: [
                  {
                    sessionId: "sess-1",
                    createdAt: "2026-06-16T00:00:00.000Z",
                    proposals: [
                      {
                        changeId: "change-a",
                        createdAt: "2026-06-16T00:01:00.000Z",
                        commitHash: hash1,
                      },
                      {
                        changeId: "change-b",
                        createdAt: "2026-06-16T00:02:00.000Z",
                        commitHash: hash2,
                      },
                    ],
                  },
                ],
              }),
            },
          ]
        );

        const result = await callLineage(client, { mode: "trace-file", filePath: "src/dup.ts" });
        const text = expectTextContent(result);
        const dto = JSON.parse(text) as Array<{ subjectId: string }>;

        expect(dto).toHaveLength(1);
        expect(dto[0].subjectId).toBe("subject-1");
      } finally {
        await close();
      }
    });

    it("trace-file returns empty array when not a git repo", async () => {
      const { client, close } = await createToolClient();
      try {
        await writeFile(join(tmpProjectPath, "file.ts"), "content");

        const result = await callLineage(client, { mode: "trace-file", filePath: "file.ts" });
        const text = expectTextContent(result);
        const dto = JSON.parse(text) as unknown[];

        expect(dto).toEqual([]);
      } finally {
        await close();
      }
    });
  });
});

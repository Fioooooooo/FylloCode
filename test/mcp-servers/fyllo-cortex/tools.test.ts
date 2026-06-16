import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { GuidelineEntry } from "../../../src/mcp-servers/fyllo-cortex/src/types";
import { registerTools } from "../../../src/mcp-servers/fyllo-cortex/src/tools";

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

function parseReadPayload(text: string): { guidelines: GuidelineEntry[] } {
  return JSON.parse(text) as { guidelines: GuidelineEntry[] };
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe("fyllo-cortex tools", () => {
  describe("tools/list", () => {
    it("lists guidelines and lineage tools", async () => {
      const { client, close } = await createToolClient();
      try {
        const result = await client.request(
          { method: "tools/list", params: {} },
          ListToolsResultSchema
        );

        expect(result.tools).toHaveLength(2);
        const names = result.tools.map((t) => t.name).sort();
        expect(names).toEqual(["guidelines", "lineage"]);

        const guidelinesTool = result.tools.find((t) => t.name === "guidelines");
        expect(guidelinesTool?.inputSchema).toMatchObject({
          type: "object",
          properties: {
            mode: {
              enum: ["read", "write"],
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
              enum: ["trace-proposal", "trace-commit"],
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

  describe("guidelines tool", () => {
    it("returns a tool_instruction block when mode=write", async () => {
      const { client, close } = await createToolClient();
      try {
        const result = await callGuidelines(client, { mode: "write" });
        const text = expectTextContent(result);

        expect(text).toContain("<tool_instruction>");
        expect(text).not.toContain("<state>");
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

    it("returns guideline entries when mode=read", async () => {
      const originalCwd = process.cwd();
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

        process.chdir(tmpDir);
        const result = await callGuidelines(client, { mode: "read" });
        const payload = parseReadPayload(expectTextContent(result));
        const paths = payload.guidelines.map((entry) => entry.path);

        expect(paths).toEqual([...paths].sort());
        expect(paths).toContain("guidelines/frontend/Routing.md");

        const byPath = new Map(payload.guidelines.map((entry) => [entry.path, entry]));
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
        process.chdir(originalCwd);
        await close();
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns empty array when guidelines directory missing", async () => {
      const originalCwd = process.cwd();
      const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-cortex-"));
      const { client, close } = await createToolClient();

      try {
        process.chdir(tmpDir);
        const result = await callGuidelines(client, { mode: "read" });
        expect(parseReadPayload(expectTextContent(result))).toEqual({ guidelines: [] });
      } finally {
        process.chdir(originalCwd);
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
        expect(dto.sessions[0].proposals).toHaveLength(1);
        expect(dto.sessions[0].proposals[0]).toMatchObject({
          changeId: "add-foo",
          commitHash: null,
          status: "pending",
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
  });
});

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
import { describe, expect, it } from "vitest";
import type { GuidelineEntry } from "../../../src/mcp-servers/fyllo-skills/src/types";
import { registerTools } from "../../../src/mcp-servers/fyllo-skills/src/tools";

async function createToolClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const server = new McpServer({ name: "fyllo-skills-test", version: "1.0.0" });
  registerTools(server);
  const client = new Client({ name: "fyllo-skills-client", version: "1.0.0" });
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
    throw new Error("Expected guidelines response to return text content");
  }

  return content.text;
}

function parseReadPayload(text: string): { guidelines: GuidelineEntry[] } {
  return JSON.parse(text) as { guidelines: GuidelineEntry[] };
}

describe("fyllo-skills tools", () => {
  it("lists only the guidelines tool", async () => {
    const { client, close } = await createToolClient();
    try {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]?.name).toBe("guidelines");
      expect(result.tools[0]?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          mode: {
            enum: ["read", "write"],
          },
        },
        required: ["mode"],
        additionalProperties: false,
      });
      await expectGuidelinesCallToFail(client, { targetPath: "/tmp", mode: "read" });
    } finally {
      await close();
    }
  });

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
    const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-skills-"));
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
    const tmpDir = await mkdtemp(join(tmpdir(), "fyllo-skills-"));
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

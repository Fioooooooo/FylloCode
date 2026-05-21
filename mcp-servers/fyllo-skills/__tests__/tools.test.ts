import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { registerTools } from "../src/tools";

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
    } finally {
      await close();
    }
  });

  it("returns a tool_instruction block for guidelines", async () => {
    const { client, close } = await createToolClient();
    try {
      const result = await client.request(
        { method: "tools/call", params: { name: "guidelines", arguments: {} } },
        CallToolResultSchema
      );

      expect(result.isError).not.toBe(true);
      expect(result.content).toHaveLength(1);
      const content = result.content[0];
      expect(content?.type).toBe("text");
      if (content?.type !== "text") {
        throw new Error("Expected guidelines response to return text content");
      }
      expect(content.text).toContain("<tool_instruction>");
      expect(content.text).not.toContain("<state>");
    } finally {
      await close();
    }
  });
});
